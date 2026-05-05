/**
 * maintenance_log handler — v1.1 ISSO export.
 *
 * Sprint 2 ships the break_glass_signins[] sub-section. Each signin observed
 * by EnclaveWatch becomes a draft entry on the maintenance_log register,
 * idempotent on alert_id. The admin later completes the acknowledgment form
 * (purpose_of_session, actions_taken, before/after_state, signed_at) which
 * flips the entry to status=final. The Monitoring tab surfaces the open
 * draft set so the admin can't ignore it.
 *
 * scheduled_maintenance[] and remote_maintenance[] sub-sections are
 * accepted but stubbed for Sprint 5 — the handler logs what was received
 * and returns the count in HandlerResult.warnings.
 *
 * Backs §3.1.7, §3.7.1, §3.7.2, §3.7.5 (per spec §4.2-§4.4).
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { writeAuditLog } from "@/lib/audit";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED_BY_BREAK_GLASS = ["3.1.7", "3.7.1", "3.7.2", "3.7.5"] as const;

interface BreakGlassSignin {
  alert_id?: string;
  detected_at?: string;
  source?: "azure" | "vault" | string;
  upn?: string;
  client_ip?: string | null;
  app_or_resource?: string | null;
  duration_seconds?: number | null;
  session_correlation_id?: string | null;
  actions_observed?: string[] | null;
  ip_classification?: "private" | "corp" | "unknown_or_shared" | string | null;
}

interface MaintenanceLogPayload {
  break_glass_signins?: BreakGlassSignin[];
  scheduled_maintenance?: unknown[];
  remote_maintenance?: unknown[];
}

export const maintenance_logHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "maintenance_log",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as MaintenanceLogPayload;

  // Stub: surface what we got but don't act on these sub-sections yet.
  const scheduledCount = section.scheduled_maintenance?.length ?? 0;
  const remoteCount = section.remote_maintenance?.length ?? 0;
  if (scheduledCount > 0) {
    result.warnings.push(
      `scheduled_maintenance[${scheduledCount}] received but Sprint 5 hasn't shipped a handler yet — entries not written`,
    );
  }
  if (remoteCount > 0) {
    result.warnings.push(
      `remote_maintenance[${remoteCount}] received but Sprint 5 hasn't shipped a handler yet — entries not written`,
    );
  }

  const signins = section.break_glass_signins ?? [];
  if (signins.length === 0) {
    return result;
  }

  // Resolve org boundary + register row.
  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push(
      "no primary boundary for org — break_glass_signins not written",
    );
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("maintenance_log");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matchingRegisters.length === 0) {
    result.warnings.push(
      "maintenance_log register not provisioned for org — break_glass_signins not written",
    );
    return result;
  }

  // Pick the row with the most entries when there are duplicates (defensive
  // pattern documented in lib/control-status.ts and applied across other
  // writers in this codebase).
  let targetRegisterId = matchingRegisters[0].id;
  if (matchingRegisters.length > 1) {
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { id: r.id, n: c?.n ?? 0 };
      }),
    );
    counts.sort((a, b) => b.n - a.n);
    targetRegisterId = counts[0].id;
  }

  const now = new Date();

  for (const signin of signins) {
    if (!signin.alert_id || typeof signin.alert_id !== "string") {
      result.warnings.push(
        "break_glass_signin missing alert_id — entry skipped",
      );
      continue;
    }
    if (!signin.upn || !signin.detected_at) {
      result.warnings.push(
        `break_glass_signin alert_id=${signin.alert_id} missing upn or detected_at — entry skipped`,
      );
      continue;
    }

    // Detection-time fields (what gets prefilled on the draft entry).
    // Never overwrite admin-filled acknowledgment fields if the entry is
    // already final or partially completed.
    const detectionData: Record<string, unknown> = {
      alert_id: signin.alert_id,
      upn: signin.upn,
      detected_at: signin.detected_at,
      source: signin.source ?? "unknown",
      client_ip: signin.client_ip ?? null,
      app_or_resource: signin.app_or_resource ?? null,
      duration_seconds: signin.duration_seconds ?? null,
      session_correlation_id: signin.session_correlation_id ?? null,
      actions_observed: signin.actions_observed ?? [],
      ip_classification: signin.ip_classification ?? "unknown_or_shared",
      manifest_id: ctx.manifestId,
    };

    // Look up existing entry by alert_id (via JSONB containment).
    const [existing] = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        status: governanceRegisterEntries.status,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
          sql`${governanceRegisterEntries.entryData} ->> 'alert_id' = ${signin.alert_id}`,
        ),
      )
      .limit(1);

    if (existing) {
      // Refresh detection fields ONLY. Preserve admin-filled
      // acknowledgment fields and final status.
      const merged = {
        ...((existing.entryData ?? {}) as Record<string, unknown>),
        ...detectionData,
      };
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData: merged,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData: detectionData,
        entryType: "break_glass_acknowledgment",
        status: "draft",
      });
      result.entries_inserted++;

      // First time we've seen this alert. Audit-log the detection so
      // assessors can reconstruct the chain from /admin/audit-logs.
      try {
        await writeAuditLog({
          organizationId: ctx.orgId,
          action: "enclavewatch.break_glass.signin_detected",
          resourceType: "break_glass_alert",
          resourceId: signin.alert_id,
          details: {
            upn: signin.upn,
            source: signin.source ?? "unknown",
            detected_at: signin.detected_at,
            client_ip: signin.client_ip ?? null,
            app_or_resource: signin.app_or_resource ?? null,
            ip_classification: signin.ip_classification ?? "unknown",
            manifest_id: ctx.manifestId,
            vault_id: ctx.vaultId,
          },
        });
      } catch {
        // No-op
      }
    }
  }

  result.controls_touched = [...COVERED_BY_BREAK_GLASS];
  return result;
};
