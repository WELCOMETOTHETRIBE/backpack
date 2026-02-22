import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
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
    await requireRole(["Admin", "Compliance", "Assessor"]);
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
    }> = {};
    if (typeof body.governanceNarrative !== "undefined") updates.governanceNarrative = body.governanceNarrative ?? null;
    if (typeof body.responsibleRoleId !== "undefined") updates.responsibleRoleId = body.responsibleRoleId ?? null;
    if (existing.controlId === "3.13.11" && typeof body.sprs31311Condition !== "undefined") {
      const v = body.sprs31311Condition;
      updates.sprs31311Condition = v === "no_crypto" || v === "non_fips" ? v : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }

    await db
      .update(controlRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(controlRecords.id, id));

    await calculateControlStatus(id);
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
