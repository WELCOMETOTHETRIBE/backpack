/**
 * previous_period_acknowledgments_review handler — closes the
 * acknowledgment loops. The ISSO's outcome judgments from the manifest
 * are applied to the matching draft entries on either:
 *   - maintenance_log.break_glass_acknowledgment       (Sprint 1)
 *   - access_authorization.privileged_grant_acknowledgment   (Phase 1 of
 *     Register-Automation v1.1 brief; Pattern A — same shape, different
 *     register & §1 verbosity fields)
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
 * The handler resolves the entry by alert_id across BOTH candidate
 * register sets and dispatches on entryType. Alert IDs are deterministic
 * by source so they don't collide across surfaces (`bg-azure-*` vs
 * `pga-azure-*`).
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
  /**
   * Optional ISSO signatory identity carried alongside the outcome. When
   * present, populates §1 verified_by / verification_note for privileged-
   * grant entries. Falls back to "ISSO (manifest signatory)" when the
   * field is absent.
   */
  verified_by?: string | null;
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

  // Resolve all candidate maintenance_log register rows (break-glass).
  const mlCandidates = resolveRegisterKeyCandidates("maintenance_log");
  const mlRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          mlCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  // Resolve all candidate access_authorization register rows (privileged-grant).
  const aaCandidates = resolveRegisterKeyCandidates("access_authorization");
  const aaRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          aaCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (mlRegisters.length === 0 && aaRegisters.length === 0) {
    result.warnings.push(
      "neither maintenance_log nor access_authorization registers provisioned for org — ack outcomes not applied",
    );
    return result;
  }

  const mlRegisterIds = mlRegisters.map((r) => r.id);
  const aaRegisterIds = aaRegisters.map((r) => r.id);
  const now = new Date();

  /**
   * Look up the entry matching `alert_id` across both candidate register
   * sets. Returns the single matching row + its parent register set
   * indicator so callers can dispatch on entry type.
   */
  async function findAckEntry(alertId: string): Promise<
    | {
        id: string;
        entryData: Record<string, unknown> | null;
        status: string;
        entryType: string;
        surface: "break_glass" | "privileged_grant";
      }
    | null
  > {
    // Privileged-grant first (Phase 1 contract uses pga-* prefix).
    if (aaRegisterIds.length > 0) {
      const [hit] = await db
        .select({
          id: governanceRegisterEntries.id,
          entryData: governanceRegisterEntries.entryData,
          status: governanceRegisterEntries.status,
          entryType: governanceRegisterEntries.entryType,
        })
        .from(governanceRegisterEntries)
        .where(
          and(
            sql`${governanceRegisterEntries.registerId} IN (${sql.join(
              aaRegisterIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            eq(governanceRegisterEntries.entryType, "privileged_grant_acknowledgment"),
            sql`${governanceRegisterEntries.entryData} ->> 'alert_id' = ${alertId}`,
          ),
        )
        .limit(1);
      if (hit) {
        return {
          id: hit.id,
          entryData: (hit.entryData ?? null) as Record<string, unknown> | null,
          status: hit.status,
          entryType: hit.entryType ?? "privileged_grant_acknowledgment",
          surface: "privileged_grant",
        };
      }
    }
    // Break-glass fall-through.
    if (mlRegisterIds.length > 0) {
      const [hit] = await db
        .select({
          id: governanceRegisterEntries.id,
          entryData: governanceRegisterEntries.entryData,
          status: governanceRegisterEntries.status,
          entryType: governanceRegisterEntries.entryType,
        })
        .from(governanceRegisterEntries)
        .where(
          and(
            sql`${governanceRegisterEntries.registerId} IN (${sql.join(
              mlRegisterIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
            eq(governanceRegisterEntries.entryType, "break_glass_acknowledgment"),
            sql`${governanceRegisterEntries.entryData} ->> 'alert_id' = ${alertId}`,
          ),
        )
        .limit(1);
      if (hit) {
        return {
          id: hit.id,
          entryData: (hit.entryData ?? null) as Record<string, unknown> | null,
          status: hit.status,
          entryType: hit.entryType ?? "break_glass_acknowledgment",
          surface: "break_glass",
        };
      }
    }
    return null;
  }

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

    const existing = await findAckEntry(item.alert_id);

    if (!existing) {
      result.warnings.push(
        `ack_review references unknown alert_id=${item.alert_id} — no matching break-glass or privileged-grant entry`,
      );
      continue;
    }

    const data = (existing.entryData ?? {}) as Record<string, unknown>;

    if (existing.surface === "break_glass") {
      const updated: Record<string, unknown> = {
        ...data,
        isso_outcome: outcome,
        isso_note: item.isso_note ?? null,
        isso_verified_at: now.toISOString(),
      };

      let newStatus: "draft" | "final" = existing.status as "draft" | "final";
      if (outcome === "verified_timely") {
        // ISSO is satisfied — finalize even if admin didn't fill all
        // acknowledgment fields. ISSO judgment is the authoritative close
        // per spec §5. Defensive surface: when ISSO closes a draft entry
        // without any admin-filled fields, emit a warning so the unusual
        // path is visible.
        const adminFieldsPresent =
          typeof data.acknowledged_by === "string" &&
          (data.acknowledged_by as string).trim().length > 0;
        if (existing.status === "draft" && !adminFieldsPresent) {
          result.warnings.push(
            `ISSO closed alert_id=${item.alert_id} as verified_timely while still in draft (no admin acknowledgment recorded). Spec-permitted override; surface for operator visibility.`,
          );
          updated.isso_closed_without_admin_ack = true;
        }
        newStatus = "final";
      } else if (outcome === "overdue_escalated") {
        updated.escalated_at = now.toISOString();
      } else if (outcome === "dispute_pending") {
        updated.dispute_status = "pending";
        updated.dispute_filed = true;
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
      continue;
    }

    // ── Privileged-grant surface ──
    // Apply §1 ISSO-verify-time fields: verified_by, verified_at,
    // verification_note. Append a manifest evidence_ref so the chain
    // back to the receipt is auditor-navigable. Lifecycle transitions:
    //   verified_timely    → lifecycle_state=isso_verified, status=final
    //   overdue_escalated  → lifecycle_state=escalated, status as-is
    //   dispute_pending    → lifecycle_state=disputed, dispute_filed=true,
    //                        status as-is
    const verifiedBy = item.verified_by ?? "ISSO (manifest signatory)";
    const existingRefs = Array.isArray(data.evidence_refs)
      ? (data.evidence_refs as Array<Record<string, unknown>>)
      : [];
    const evidenceRefs: Array<Record<string, unknown>> = [
      ...existingRefs,
      {
        type: "manifest_id",
        value: ctx.manifestId,
        label: `ISSO weekly export carrying ack_review outcome (${outcome})`,
      },
    ];
    const provenance =
      (data.provenance as Record<string, unknown> | undefined) ?? {};
    const mergedProvenance = {
      ...provenance,
      manifest_id: ctx.manifestId,
      ack_review_applied_at: now.toISOString(),
    };

    const updated: Record<string, unknown> = {
      ...data,
      isso_outcome: outcome,
      isso_note: item.isso_note ?? null,
      verified_by: verifiedBy,
      verified_at: now.toISOString(),
      verification_note: item.isso_note ?? null,
      evidence_refs: evidenceRefs,
      provenance: mergedProvenance,
      manifest_id: ctx.manifestId,
    };

    let newStatus: "draft" | "final" = existing.status as "draft" | "final";
    if (outcome === "verified_timely") {
      const adminFieldsPresent =
        typeof data.business_justification === "string" &&
        (data.business_justification as string).trim().length > 0;
      if (existing.status === "draft" && !adminFieldsPresent) {
        result.warnings.push(
          `ISSO closed alert_id=${item.alert_id} as verified_timely while still in draft (no admin justification recorded). Spec-permitted override; surface for operator visibility.`,
        );
        updated.isso_closed_without_admin_justification = true;
      }
      updated.lifecycle_state = "isso_verified";
      newStatus = "final";
    } else if (outcome === "overdue_escalated") {
      updated.escalated_at = now.toISOString();
      updated.lifecycle_state = "escalated";
    } else if (outcome === "dispute_pending") {
      updated.dispute_status = "pending";
      updated.dispute_filed = true;
      updated.lifecycle_state = "disputed";
    }

    await db
      .update(governanceRegisterEntries)
      .set({
        entryData: updated,
        status: newStatus,
        finalizedAt:
          newStatus === "final" && !existing.entryData ? now : undefined,
        updatedAt: now,
      })
      .where(eq(governanceRegisterEntries.id, existing.id));
    result.entries_updated++;

    console.log(
      JSON.stringify({
        event: "enclavewatch.privileged_grant.ack_review_applied",
        orgId: ctx.orgId,
        alertId: item.alert_id,
        outcome,
        manifestId: ctx.manifestId,
      }),
    );
    try {
      await writeAuditLog({
        organizationId: ctx.orgId,
        action: "enclavewatch.privileged_grant.ack_review_applied",
        resourceType: "privileged_grant_alert",
        resourceId: item.alert_id,
        details: {
          outcome,
          isso_note: item.isso_note ?? null,
          verified_by: verifiedBy,
          manifest_id: ctx.manifestId,
          entry_id: existing.id,
          related_grant_entry_id:
            (data.related_grant_entry_id as string | null | undefined) ?? null,
        },
      });
    } catch {
      // No-op
    }
  }

  return result;
};
