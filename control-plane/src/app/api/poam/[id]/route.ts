import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  poamItems,
  poamMilestones,
  poamClosureApprovals,
  controlImplementations,
  controls,
  users,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [item] = await db
      .select({
        id: poamItems.id,
        poamId: poamItems.poamId,
        title: poamItems.title,
        description: poamItems.description,
        rootCause: poamItems.rootCause,
        riskSeverity: poamItems.riskSeverity,
        status: poamItems.status,
        targetCompletionDate: poamItems.targetCompletionDate,
        responsiblePartyId: poamItems.responsiblePartyId,
        evidenceMetadataRef: poamItems.evidenceMetadataRef,
        closedAt: poamItems.closedAt,
        control: { controlId: controls.controlId, title: controls.title },
      })
      .from(poamItems)
      .innerJoin(controlImplementations, eq(poamItems.controlImplementationId, controlImplementations.id))
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .where(
        and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId))
      );

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const milestones = await db
      .select()
      .from(poamMilestones)
      .where(eq(poamMilestones.poamItemId, id));
    const approvals = await db
      .select({
        id: poamClosureApprovals.id,
        approverId: poamClosureApprovals.approverId,
        approvalOrder: poamClosureApprovals.approvalOrder,
        attestedAt: poamClosureApprovals.attestedAt,
        approverEmail: users.email,
      })
      .from(poamClosureApprovals)
      .leftJoin(users, eq(poamClosureApprovals.approverId, users.id))
      .where(eq(poamClosureApprovals.poamItemId, id));

    return NextResponse.json({ ...item, milestones, closureApprovals: approvals });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = await req.json();

    const [existing] = await db
      .select()
      .from(poamItems)
      .where(
        and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId))
      );
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed: Record<string, unknown> = {};
    if (body.status !== undefined) allowed.status = body.status;
    if (body.title !== undefined) allowed.title = body.title;
    if (body.description !== undefined) allowed.description = body.description;
    if (body.rootCause !== undefined) allowed.rootCause = body.rootCause;
    if (body.riskSeverity !== undefined) allowed.riskSeverity = body.riskSeverity;
    if (body.targetCompletionDate !== undefined)
      allowed.targetCompletionDate = new Date(body.targetCompletionDate);
    if (body.responsiblePartyId !== undefined)
      allowed.responsiblePartyId = body.responsiblePartyId;
    if (body.evidenceMetadataRef !== undefined)
      allowed.evidenceMetadataRef = body.evidenceMetadataRef;
    if (body.status === "Closed") allowed.closedAt = new Date();

    const [updated] = await db
      .update(poamItems)
      .set({ ...allowed, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(poamItems.id, id))
      .returning();

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "poam.update",
      resourceType: "poam_item",
      resourceId: id,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
