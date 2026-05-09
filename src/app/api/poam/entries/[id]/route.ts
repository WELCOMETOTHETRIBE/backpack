import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  poamEntries,
  controlRecords,
  poamEntryMilestones,
  poamEntryClosureApprovals,
  users,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

/**
 * GET /api/poam/entries/:id — get one POA&M entry with milestones and closure approvals.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [record] = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.id, entry.controlRecordId))
      .limit(1);

    const milestones = await db
      .select()
      .from(poamEntryMilestones)
      .where(eq(poamEntryMilestones.poamEntryId, id))
      .orderBy(asc(poamEntryMilestones.orderIndex));

    const approvals = await db
      .select({
        id: poamEntryClosureApprovals.id,
        approverId: poamEntryClosureApprovals.approverId,
        approvalOrder: poamEntryClosureApprovals.approvalOrder,
        attestedAt: poamEntryClosureApprovals.attestedAt,
        approverEmail: users.email,
      })
      .from(poamEntryClosureApprovals)
      .leftJoin(users, eq(poamEntryClosureApprovals.approverId, users.id))
      .where(eq(poamEntryClosureApprovals.poamEntryId, id));

    return NextResponse.json({
      ...entry,
      controlId: record?.controlId ?? null,
      milestones,
      closureApprovals: approvals,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PATCH /api/poam/entries/:id — update entry fields.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const updates: Partial<{
      weaknessDescription: string | null;
      remediationPlan: string | null;
      scheduledCompletionDate: string | null;
      responsibleRoleId: string | null;
      status: "open" | "closed" | "draft" | "active";
      deficiencyReviewSummary: string | null;
      progressSummary: string | null;
      originalCompletionDate: string | null;
      targetPushedCount: number;
      finalizedAt: Date | null;
      kind: "operational" | "assessment";
    }> = {};

    // Tier 2 #5 — kind discriminator. v2.13 page 204 distinguishes
    // operational (CA.L2-3.12.2, no 180d cap) from assessment (32 CFR
    // § 170.21, 180d cap to qualify for Conditional Level 2 CMMC
    // Status). Admin must explicitly opt-in to 'assessment'; the
    // 180-day window starts at created_at and cannot be exceeded.
    if (
      typeof body.kind !== "undefined" &&
      (body.kind === "operational" || body.kind === "assessment")
    ) {
      if (body.kind === "assessment") {
        // Validate the 180-day window. created_at is fixed; if a
        // scheduled date is set or supplied, it must fit within
        // (created_at, created_at + 180d).
        const created = new Date(existing.createdAt);
        const cap = new Date(created.getTime() + 180 * 24 * 3600 * 1000);
        const scheduled =
          typeof body.scheduledCompletionDate === "string" &&
          body.scheduledCompletionDate
            ? new Date(body.scheduledCompletionDate)
            : existing.scheduledCompletionDate
              ? new Date(existing.scheduledCompletionDate)
              : null;
        if (scheduled && scheduled > cap) {
          return NextResponse.json(
            {
              error:
                `Assessment POA&M scheduled completion (${scheduled.toISOString().slice(0, 10)}) exceeds 180 days from created_at (${created.toISOString().slice(0, 10)}). Per 32 CFR § 170.21, assessment POA&Ms have a hard 180-day closeout. Either reduce the scheduled date or keep the kind as 'operational' (no cap, CA.L2-3.12.2).`,
              code: "assessment_poam_exceeds_180d",
              createdAt: created.toISOString(),
              cap: cap.toISOString(),
              scheduled: scheduled.toISOString(),
            },
            { status: 409 },
          );
        }
      }
      updates.kind = body.kind;
    }

    if (typeof body.weaknessDescription !== "undefined") updates.weaknessDescription = body.weaknessDescription ?? null;
    if (typeof body.remediationPlan !== "undefined") updates.remediationPlan = body.remediationPlan ?? null;
    if (typeof body.responsibleRoleId !== "undefined") updates.responsibleRoleId = body.responsibleRoleId ?? null;

    // AG p.10 fields: a POA&M counts as a MET-elevator only when these
    // are populated. New code paths should write them; legacy callers
    // can still PATCH the older fields.
    if (typeof body.deficiencyReviewSummary !== "undefined") updates.deficiencyReviewSummary = body.deficiencyReviewSummary ?? null;
    if (typeof body.progressSummary !== "undefined") updates.progressSummary = body.progressSummary ?? null;

    // Status: accept the legacy {open, closed} pair plus the Phase A2
    // {draft, active} pair. A draft → active transition is the
    // "finalize the POA&M" event — set finalizedAt automatically.
    if (
      typeof body.status !== "undefined" &&
      (body.status === "open" || body.status === "closed" || body.status === "draft" || body.status === "active")
    ) {
      updates.status = body.status;
      if (body.status === "active" && existing.status === "draft") {
        updates.finalizedAt = new Date();
        // Anchor the chronic-slippage detection to this date if no
        // original_completion_date was supplied yet.
        if (!existing.originalCompletionDate && body.scheduledCompletionDate) {
          updates.originalCompletionDate = body.scheduledCompletionDate;
        }
      }
    }

    // scheduled_completion_date — track pushes for chronic-slippage
    // detection. Only count moves *forward* (later in time).
    if (typeof body.scheduledCompletionDate !== "undefined") {
      const next = body.scheduledCompletionDate ?? null;
      updates.scheduledCompletionDate = next;
      if (
        existing.scheduledCompletionDate &&
        next &&
        new Date(next) > new Date(existing.scheduledCompletionDate)
      ) {
        updates.targetPushedCount = (existing.targetPushedCount ?? 0) + 1;
      }
    }

    if (Object.keys(updates).length === 0) return NextResponse.json(existing);

    const [updated] = await db
      .update(poamEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(poamEntries.id, id))
      .returning();

    // Phase B trigger: rescore the underlying control. Status transitions
    // (draft → active, active → closed), target-date pushes, or AG-field
    // populations all affect the operational-plan elevator's eligibility.
    const [cr] = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.id, existing.controlRecordId))
      .limit(1);
    if (cr?.controlId) {
      const triggerSource = updates.status === "active" && existing.status === "draft"
        ? "poam_finalized"
        : updates.targetPushedCount !== undefined
          ? "poam_target_pushed"
          : updates.status === "closed"
            ? "poam_closed"
            : "poam_created";
      await scoreControlsAffectedBy({
        organizationId: orgId,
        triggerSource,
        controlIds: [cr.controlId],
        triggeredByUserId: user.id ?? null,
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
