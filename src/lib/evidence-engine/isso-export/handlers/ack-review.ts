/**
 * previous_period_acknowledgments_review handler — closes the break-glass
 * loop. The ISSO's outcome judgments from the manifest are applied to the
 * corresponding maintenance_log break_glass_acknowledgment entries.
 *
 *   verified_timely    → entry is marked ISSO-verified; if still draft and
 *                        admin acknowledged in time, finalize. If admin
 *                        hasn't acknowledged but ISSO is OK with that,
 *                        finalize anyway with isso_outcome=verified_timely.
 *   overdue_escalated  → entry stays in current state but is flagged
 *                        escalated. Audit event emitted. Future Sprint 6
 *                        UI shows escalation status to ops.
 *   dispute_pending    → entry stays open with dispute_status=pending.
 *                        Reserved for v1.2 (Sprint 6+) UI.
 *
 * Per spec §11.
 */

import { db } from "@/db";
import {
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { writeAuditLog } from "@/lib/audit";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

interface AckReviewItem {
  alert_id?: string;
  outcome?: "verified_timely" | "overdue_escalated" | "dispute_pending" | string;
  isso_note?: string | null;
}

interface AckReviewPayload {
  items?: AckReviewItem[];
}

export const previous_period_acknowledgments_reviewHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "previous_period_acknowledgments_review",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const items = ((payload ?? {}) as AckReviewPayload).items ?? [];
  if (items.length === 0) return result;

  // Resolve all candidate maintenance_log register rows for the org.
  const candidates = resolveRegisterKeyCandidates("maintenance_log");
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
    result.warnings.push(
      "maintenance_log register not provisioned for org — ack outcomes not applied",
    );
    return result;
  }

  const registerIds = matchingRegisters.map((r) => r.id);
  const now = new Date();

  for (const item of items) {
    if (!item.alert_id) {
      result.warnings.push("ack_review item missing alert_id — skipped");
      continue;
    }
    const outcome = item.outcome;
    if (
      outcome !== "verified_timely" &&
      outcome !== "overdue_escalated" &&
      outcome !== "dispute_pending"
    ) {
      result.warnings.push(
        `ack_review item alert_id=${item.alert_id} has invalid outcome ${outcome ?? "(missing)"} — skipped`,
      );
      continue;
    }

    // Find the entry by alert_id across any candidate register row.
    const [existing] = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
        status: governanceRegisterEntries.status,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            registerIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
          sql`${governanceRegisterEntries.entryData} ->> 'alert_id' = ${item.alert_id}`,
        ),
      )
      .limit(1);

    if (!existing) {
      result.warnings.push(
        `ack_review references unknown alert_id=${item.alert_id} — no matching maintenance_log entry`,
      );
      continue;
    }

    const data = (existing.entryData ?? {}) as Record<string, unknown>;
    const updated: Record<string, unknown> = {
      ...data,
      isso_outcome: outcome,
      isso_note: item.isso_note ?? null,
      isso_verified_at: now.toISOString(),
    };

    let newStatus: "draft" | "final" = existing.status as "draft" | "final";
    if (outcome === "verified_timely") {
      // ISSO is satisfied — finalize even if admin didn't fill all
      // acknowledgment fields. ISSO judgment is the authoritative close.
      newStatus = "final";
    } else if (outcome === "overdue_escalated") {
      updated.escalated_at = now.toISOString();
      // Status stays as-is; escalation is a flag, not a close.
    } else if (outcome === "dispute_pending") {
      updated.dispute_status = "pending";
      updated.dispute_filed = true;
      // Status stays as-is.
    }

    await db
      .update(governanceRegisterEntries)
      .set({
        entryData: updated,
        status: newStatus,
        finalizedAt: newStatus === "final" && !existing.entryData ? now : undefined,
        updatedAt: now,
      })
      .where(eq(governanceRegisterEntries.id, existing.id));
    result.entries_updated++;

    console.log(
      JSON.stringify({
        event: "enclavewatch.break_glass.ack_review_applied",
        orgId: ctx.orgId,
        alertId: item.alert_id,
        outcome,
        manifestId: ctx.manifestId,
      }),
    );
    try {
      await writeAuditLog({
        organizationId: ctx.orgId,
        action: "enclavewatch.break_glass.ack_review_applied",
        resourceType: "break_glass_alert",
        resourceId: item.alert_id,
        details: {
          outcome,
          isso_note: item.isso_note ?? null,
          manifest_id: ctx.manifestId,
          entry_id: existing.id,
        },
      });
    } catch {
      // No-op
    }
  }

  return result;
};
