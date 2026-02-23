import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { calculateControlStatus } from "@/lib/control-status";
import { computeAndPersistSprsScore } from "@/lib/sprs";

/**
 * PATCH /api/control-records/:id — update governance narrative, responsibleRoleId, etc.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(controlRecords)
      .where(and(eq(controlRecords.id, id), eq(controlRecords.organizationId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Partial<{
      governanceNarrative: string | null;
      responsibleRoleId: string | null;
      sprs31311Condition: string | null;
      implementationStatus: "not_started" | "in_progress" | "implemented" | "assessed" | "inherited";
    }> = {};
    if (typeof body.governanceNarrative !== "undefined") updates.governanceNarrative = body.governanceNarrative ?? null;
    if (typeof body.responsibleRoleId !== "undefined") updates.responsibleRoleId = body.responsibleRoleId ?? null;
    if (existing.controlId === "3.13.11" && typeof body.sprs31311Condition !== "undefined") {
      const v = body.sprs31311Condition;
      updates.sprs31311Condition = v === "no_crypto" || v === "non_fips" ? v : null;
    }
    const validStatuses = ["not_started", "in_progress", "implemented", "assessed", "inherited"] as const;
    if (typeof body.implementationStatus === "string" && validStatuses.includes(body.implementationStatus as (typeof validStatuses)[number])) {
      updates.implementationStatus = body.implementationStatus as (typeof validStatuses)[number];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }

    if (user.id) {
      for (const [fieldName, newVal] of Object.entries(updates)) {
        if (fieldName === "implementationStatus") continue; // avoid logging status in history if desired, or allow it
        const oldVal = existing[fieldName as keyof typeof existing];
        const oldStr = oldVal != null ? String(oldVal) : null;
        const newStr = newVal != null ? String(newVal) : null;
        if (oldStr !== newStr) {
          await db.insert(controlRecordHistory).values({
            controlRecordId: id,
            changedById: user.id,
            fieldName,
            oldValue: oldStr,
            newValue: newStr,
          });
        }
      }
    }

    await db
      .update(controlRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(controlRecords.id, id));

    // Only recalculate status from evidence when not manually overriding
    if (!("implementationStatus" in updates)) {
      await calculateControlStatus(id);
    }
    if ("sprs31311Condition" in updates) {
      await computeAndPersistSprsScore(existing.organizationId);
    }

    const [updated] = await db
      .select()
      .from(controlRecords)
      .where(eq(controlRecords.id, id))
      .limit(1);

    return NextResponse.json(updated ?? existing);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update control record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
