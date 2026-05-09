import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, poamEntries, poamEntryMilestones } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

/**
 * PATCH /api/poam/entries/:id/milestones/:mid — update milestone (e.g. set completedAt).
 * Body: { title?, dueDate?, completedAt? }
 *
 * Rescore: marking a milestone complete is a progress signal that may
 * affect the POA&M elevator's eligibility (and is exactly the kind of
 * write the customer's "outstanding → POA&M" rule expects to see
 * propagate to the SCTM). Fires scoreControlsAffectedBy on the
 * underlying control whenever completedAt transitions either way.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id, mid } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [milestone] = await db
      .select()
      .from(poamEntryMilestones)
      .where(
        and(
          eq(poamEntryMilestones.id, mid),
          eq(poamEntryMilestones.poamEntryId, id)
        )
      )
      .limit(1);
    if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const body = await req.json();
    const updates: {
      title?: string;
      dueDate?: string | null;
      completedAt?: Date | null;
    } = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.dueDate !== "undefined") updates.dueDate = body.dueDate ?? null;
    let completedAtChanged = false;
    if (typeof body.completedAt !== "undefined") {
      const next =
        body.completedAt === null || body.completedAt === ""
          ? null
          : new Date(body.completedAt);
      updates.completedAt = next;
      const wasCompleted = milestone.completedAt !== null;
      const willBeCompleted = next !== null;
      completedAtChanged = wasCompleted !== willBeCompleted;
    }

    if (Object.keys(updates).length === 0) return NextResponse.json(milestone);

    const [updated] = await db
      .update(poamEntryMilestones)
      .set(updates)
      .where(eq(poamEntryMilestones.id, mid))
      .returning();

    // Trigger a rescore when a milestone's completion state flipped —
    // a milestone complete (or re-opened) changes the elevator's
    // progress posture and may cascade into the SCTM.
    if (completedAtChanged) {
      const [cr] = await db
        .select({ controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(eq(controlRecords.id, entry.controlRecordId))
        .limit(1);
      if (cr?.controlId) {
        await scoreControlsAffectedBy({
          organizationId: orgId,
          triggerSource: "poam_milestone_completed",
          controlIds: [cr.controlId],
          triggeredByUserId: user.id ?? null,
        });
      }
    }

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update milestone";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
