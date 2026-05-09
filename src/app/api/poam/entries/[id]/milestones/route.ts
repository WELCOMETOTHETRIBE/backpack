import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, poamEntries, poamEntryMilestones } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

/**
 * POST /api/poam/entries/:id/milestones — add a milestone.
 * Body: { title, dueDate? }
 *
 * Auto-promotion: when the FIRST milestone is added to a POA&M in
 * status='draft', this endpoint also promotes the entry to
 * status='active' and stamps finalized_at + (if missing)
 * original_completion_date. Adding the first milestone is the
 * canonical "human is engaging with this triage" signal — it's the
 * cleanest place to make the draft → active transition automatic so
 * the operator doesn't have to remember a separate Promote button.
 *
 * Per AG p.10 the operational_plan_of_action elevator additionally
 * requires deficiency_review_summary + progress_summary populated;
 * canPoamElevate() in src/lib/canonical-state/auto-poam.ts enforces
 * those, so promoting to 'active' here is *necessary* but not
 * sufficient for the elevator to fire. The status transition itself
 * is what the rescore trigger needs to recompute met_via correctly.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const existing = await db
      .select({ id: poamEntryMilestones.id })
      .from(poamEntryMilestones)
      .where(eq(poamEntryMilestones.poamEntryId, id));
    const wasFirstMilestone = existing.length === 0;

    const [inserted] = await db
      .insert(poamEntryMilestones)
      .values({
        poamEntryId: id,
        title,
        dueDate: body.dueDate ?? null,
        orderIndex: existing.length,
      })
      .returning();

    // Auto-promote draft → active on first milestone. Idempotent —
    // only fires when status is currently 'draft'.
    let promoted = false;
    if (wasFirstMilestone && entry.status === "draft") {
      const updates: Partial<typeof poamEntries.$inferInsert> = {
        status: "active",
        finalizedAt: new Date(),
        updatedAt: new Date(),
      };
      // Anchor chronic-slippage detection if missing.
      if (!entry.originalCompletionDate && entry.scheduledCompletionDate) {
        updates.originalCompletionDate = entry.scheduledCompletionDate;
      }
      await db.update(poamEntries).set(updates).where(eq(poamEntries.id, id));
      promoted = true;

      // Fire the canonical rescore so the underlying control's
      // met_via flips to operational_plan_of_action (assuming the
      // other AG fields are populated; canPoamElevate gates that).
      const [cr] = await db
        .select({ controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(eq(controlRecords.id, entry.controlRecordId))
        .limit(1);
      if (cr?.controlId) {
        await scoreControlsAffectedBy({
          organizationId: orgId,
          triggerSource: "poam_finalized",
          controlIds: [cr.controlId],
          triggeredByUserId: user.id ?? null,
        });
      }
    }

    return NextResponse.json({ ...inserted, _promotedToActive: promoted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add milestone";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
