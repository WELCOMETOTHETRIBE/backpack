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
    await requireRole(["Admin", "Compliance"]);
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
      status: "open" | "closed";
    }> = {};
    if (typeof body.weaknessDescription !== "undefined") updates.weaknessDescription = body.weaknessDescription ?? null;
    if (typeof body.remediationPlan !== "undefined") updates.remediationPlan = body.remediationPlan ?? null;
    if (typeof body.scheduledCompletionDate !== "undefined") updates.scheduledCompletionDate = body.scheduledCompletionDate ?? null;
    if (typeof body.responsibleRoleId !== "undefined") updates.responsibleRoleId = body.responsibleRoleId ?? null;
    if (typeof body.status !== "undefined" && (body.status === "open" || body.status === "closed")) updates.status = body.status;

    if (Object.keys(updates).length === 0) return NextResponse.json(existing);

    const [updated] = await db
      .update(poamEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(poamEntries.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
