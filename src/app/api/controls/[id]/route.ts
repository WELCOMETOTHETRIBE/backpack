import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  controlFamilies,
  controlHistory,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
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

    const [impl] = await db
      .select({
        id: controlImplementations.id,
        controlId: controlImplementations.controlId,
        status: controlImplementations.status,
        implementationNarrative: controlImplementations.implementationNarrative,
        responsibleOwnerId: controlImplementations.responsibleOwnerId,
        monitoringCadence: controlImplementations.monitoringCadence,
        lastValidationDate: controlImplementations.lastValidationDate,
        policySopRefs: controlImplementations.policySopRefs,
        createdAt: controlImplementations.createdAt,
        updatedAt: controlImplementations.updatedAt,
        control: {
          controlId: controls.controlId,
          nistReqId: controls.nistReqId,
          title: controls.title,
          nistExactText: controls.nistExactText,
          nistDiscussionGuidance: controls.nistDiscussionGuidance,
          familyCode: controlFamilies.code,
          familyName: controlFamilies.name,
        },
      })
      .from(controlImplementations)
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
      .where(
        and(
          eq(controlImplementations.id, id),
          eq(controlImplementations.organizationId, orgId)
        )
      );

    if (!impl) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const history = await db
      .select({
        id: controlHistory.id,
        fieldName: controlHistory.fieldName,
        oldValue: controlHistory.oldValue,
        newValue: controlHistory.newValue,
        createdAt: controlHistory.createdAt,
        changedByEmail: users.email,
      })
      .from(controlHistory)
      .leftJoin(users, eq(controlHistory.changedById, users.id))
      .where(eq(controlHistory.controlImplementationId, id))
      .orderBy(desc(controlHistory.createdAt));

    return NextResponse.json({ ...impl, history });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

const ALLOWED_FIELDS = [
  "status",
  "implementationNarrative",
  "responsibleOwnerId",
  "monitoringCadence",
  "lastValidationDate",
  "policySopRefs",
] as const;

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
      .from(controlImplementations)
      .where(
        and(
          eq(controlImplementations.id, id),
          eq(controlImplementations.organizationId, orgId)
        )
      );
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        const oldVal = existing[field];
        const newVal = body[field];
        if (oldVal !== newVal) {
          updates[field] = newVal;
          await db.insert(controlHistory).values({
            controlImplementationId: id,
            changedById: user.id!,
            fieldName: field,
            oldValue: oldVal != null ? String(oldVal) : null,
            newValue: newVal != null ? String(newVal) : null,
          });
        }
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(controlImplementations)
      .set(updates as Record<string, unknown>)
      .where(and(eq(controlImplementations.id, id), eq(controlImplementations.organizationId, orgId)))
      .returning();

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "control_implementation.update",
      resourceType: "control_implementation",
      resourceId: id,
      details: { updatedFields: Object.keys(updates) },
    });

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
