/**
 * Auto-POA&M-on-NOT-MET helper.
 *
 * Customer's directive: "for anything outstanding in our SCTM we will
 * take POAMs." Per AG p.10, an Operational Plan of Action with
 * deficiency reviews + milestones + progress is one of the four
 * MET-elevators — *for temporary deficiencies*. This helper enforces
 * that contract:
 *
 *   1. ensureDraftPoamForNotMet() creates a STUB POA&M (status='draft')
 *      for any (org, control) that doesn't yet have an open POA&M
 *      attached. Stubs do NOT elevate the verdict — they're a
 *      to-do landing pad. The customer fills the AG-mandated fields
 *      (deficiency_review_summary, milestones, progress_summary,
 *      original_completion_date), then transitions status='active' to
 *      activate the elevator.
 *
 *   2. canPoamElevate() returns true ONLY when the POA&M is fully
 *      AG-compliant: status='active', deficiency review present,
 *      progress summary present, original completion date set, NOT
 *      chronic-slipped. The rescore engine reads this to decide
 *      whether to flip the snapshot's met_via to
 *      'operational_plan_of_action'.
 *
 *   3. isPoamChronicallySlipped() (re-exported from get-control-state)
 *      enforces the "temporary deficiencies" reservation in AG p.10.
 *      A POA&M open >365 days from original_completion_date OR with
 *      target_pushed_count > 2 stops counting as a MET-elevator.
 *
 * The helper is side-effect-light: it writes to poam_entries only,
 * never to control_adjudication_snapshots. The rescore engine (Phase B)
 * is the one that updates the snapshot's elevator field; this helper
 * just ensures the POA&M exists so the snapshot has something to point
 * at.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlRecords,
  poamEntries,
  poamEntryMilestones,
} from "@/db/schema";
import { isPoamChronicallySlipped } from "@/lib/canonical-state/get-control-state";

export { isPoamChronicallySlipped };

/**
 * Returns true when the POA&M has every AG-mandated field populated and
 * is in active status (not draft, not closed, not chronic-slipped).
 *
 * AG p.10:
 *   "Temporary deficiencies that are appropriately addressed in
 *   operational plans of action (i.e., include deficiency reviews,
 *   milestones, and show progress towards the implementation of
 *   corrections to reduce or eliminate identified vulnerabilities)
 *   shall be assessed as MET."
 *
 * The fields enforced here:
 *   - status='active' (not draft, not closed)
 *   - deficiency_review_summary present (≥ 20 chars — AG's "deficiency
 *     review" term implies non-trivial content)
 *   - progress_summary present (any non-empty content; "no progress
 *     yet" is acceptable initial content)
 *   - at least one row in poam_entry_milestones (AG's "milestones")
 *   - original_completion_date set (slippage anchor)
 *   - not chronic-slipped per isPoamChronicallySlipped()
 */
export async function canPoamElevate(
  poam: typeof poamEntries.$inferSelect,
): Promise<{ canElevate: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  if (poam.status !== "active") {
    reasons.push(`status='${poam.status}' (need 'active')`);
  }
  if (!poam.deficiencyReviewSummary || poam.deficiencyReviewSummary.trim().length < 20) {
    reasons.push("deficiency_review_summary missing or too short (<20 chars)");
  }
  if (!poam.progressSummary || poam.progressSummary.trim().length === 0) {
    reasons.push("progress_summary missing");
  }
  if (!poam.originalCompletionDate) {
    reasons.push("original_completion_date missing (slippage anchor)");
  }
  // Milestones — at least one must exist
  const milestoneCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(poamEntryMilestones)
    .where(eq(poamEntryMilestones.poamEntryId, poam.id));
  if ((milestoneCount[0]?.n ?? 0) === 0) {
    reasons.push("no milestones recorded");
  }
  if (isPoamChronicallySlipped(poam)) {
    reasons.push(
      `chronic-slipped (>365d from original_completion_date or >2 target pushes); AG p.10 reserves elevator for temporary deficiencies`,
    );
  }

  return { canElevate: reasons.length === 0, reasons };
}

/**
 * Ensure a draft POA&M exists for a control whose canonical state is
 * NOT_MET. Idempotent — if any non-closed POA&M already exists for
 * this control_record, this is a no-op and returns the existing row.
 *
 * The created stub has:
 *   - status='draft' (does NOT elevate the verdict; customer must
 *     finalize)
 *   - auto_created_for_objective: optional letter ("a", "b", …) when
 *     the trigger came from a per-objective rescore; null when
 *     generated from an aggregate NOT_MET
 *   - auto_created_at: now()
 *   - weakness_description: stub line referencing the control title
 *   - remediation_plan: empty placeholder
 *   - responsible_role_id: copied from control_records.responsible_role_id
 *     when set (else null — customer assigns later)
 *   - All AG-mandated fields (deficiency_review_summary,
 *     progress_summary, original_completion_date) start NULL — the
 *     stub deliberately can't elevate until the customer fills them.
 *
 * Returns { poam, created } where `created` is true iff this call
 * inserted a new row.
 */
export async function ensureDraftPoamForNotMet(input: {
  organizationId: string;
  controlId: string;
  controlTitle?: string | null;
  triggeringObjective?: string | null;
}): Promise<{ poam: typeof poamEntries.$inferSelect; created: boolean }> {
  // Resolve control_record_id for this (org, control).
  const [cr] = await db
    .select({
      id: controlRecords.id,
      responsibleRoleId: controlRecords.responsibleRoleId,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, input.organizationId),
        eq(controlRecords.controlId, input.controlId),
      ),
    )
    .limit(1);

  if (!cr) {
    throw new Error(
      `No control_record found for org=${input.organizationId} control=${input.controlId}`,
    );
  }

  // Any open POA&M (draft, active, in_progress, blocked, accepted) for
  // this control? If yes, do nothing. We only auto-create the FIRST
  // stub; subsequent NOT_MET signals attach to the existing row.
  const existing = await db
    .select()
    .from(poamEntries)
    .where(
      and(
        eq(poamEntries.controlRecordId, cr.id),
        // status not in {closed, cancelled} — the open lifecycle.
        sql`${poamEntries.status}::text NOT IN ('closed', 'cancelled')`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { poam: existing[0], created: false };
  }

  const stubWeakness = input.controlTitle
    ? `${input.controlId} — ${input.controlTitle}: control marked NOT MET by canonical adjudication helper. Auto-created stub; fill deficiency_review_summary, milestones, progress_summary, and original_completion_date to activate this POA&M as a MET-elevator per AG p.10.`
    : `${input.controlId}: control marked NOT MET by canonical adjudication helper. Auto-created stub; fill AG-mandated fields to activate.`;

  const [created] = await db
    .insert(poamEntries)
    .values({
      organizationId: input.organizationId,
      controlRecordId: cr.id,
      status: "draft",
      weaknessDescription: stubWeakness,
      remediationPlan: null,
      responsibleRoleId: cr.responsibleRoleId,
      autoCreatedForObjective: input.triggeringObjective ?? null,
      autoCreatedAt: new Date(),
    })
    .returning();

  return { poam: created, created: true };
}

/**
 * Bulk variant — ensure a draft POA&M for every NOT_MET control in an
 * org. Used by the Phase A2 backfill and by the Phase B rescore
 * trigger when many controls flip in a single batch.
 *
 * Returns { created, skipped, errored } counts. Idempotent.
 */
export async function ensureDraftPoamsForOrg(input: {
  organizationId: string;
  notMetControlIds: string[];
  controlTitles?: Map<string, string>;
}): Promise<{ created: number; skipped: number; errored: number }> {
  let created = 0;
  let skipped = 0;
  let errored = 0;
  for (const cid of input.notMetControlIds) {
    try {
      const r = await ensureDraftPoamForNotMet({
        organizationId: input.organizationId,
        controlId: cid,
        controlTitle: input.controlTitles?.get(cid) ?? null,
      });
      if (r.created) created++;
      else skipped++;
    } catch {
      errored++;
    }
  }
  return { created, skipped, errored };
}
