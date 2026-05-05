/**
 * incident_log handler — v1.1 ISSO export §4.5.
 *
 * The ISSO observes incidents that occurred during the review window and
 * lists them in the manifest. Each item lands as an `incident_opened`
 * entry on the incident_log register, idempotent on `incident_id`.
 *
 * Backs §3.6.1, §3.6.2.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.6.1", "3.6.2"] as const;

interface IncidentItem {
  incident_id?: string;
  opened_at?: string;
  severity?: "critical" | "high" | "medium" | "low" | string;
  summary?: string;
  response_actions?: string;
  closed_at?: string | null;
  ticket?: string | null;
  scope?: string;
  detected_by?: string;
}

interface IncidentLogPayload {
  incidents_during_period?: IncidentItem[];
}

export const incident_logHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "incident_log",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const incidents = ((payload ?? {}) as IncidentLogPayload).incidents_during_period ?? [];
  if (incidents.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — incidents not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("incident_log");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
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
    result.warnings.push("incident_log register not provisioned for org");
    return result;
  }

  // Pick the row with the most entries when duplicates exist (defensive).
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

  for (const inc of incidents) {
    if (!inc.incident_id || !inc.opened_at || !inc.severity || !inc.summary) {
      result.warnings.push(
        `incident missing required fields (incident_id/opened_at/severity/summary) — skipped`,
      );
      continue;
    }

    const entryData: Record<string, unknown> = {
      incident_id: inc.incident_id,
      detected_at: inc.opened_at,
      detected_by: inc.detected_by ?? "siem",
      severity: inc.severity,
      summary: inc.summary,
      scope: inc.scope ?? "(unspecified)",
      initial_actions: inc.response_actions ?? null,
      closed_at: inc.closed_at ?? null,
      ticket: inc.ticket ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "incident_opened"),
          sql`${governanceRegisterEntries.entryData} ->> 'incident_id' = ${inc.incident_id}`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status: "final",
          finalizedAt: now,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "incident_opened",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
