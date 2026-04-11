import { NextResponse } from "next/server";
import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const rows = await db
      .select()
      .from(trainingRecords)
      .where(eq(trainingRecords.organizationId, orgId))
      .orderBy(desc(trainingRecords.completedAt));

    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const body = await req.json();
    const { personnelName, personnelEmail, trainingType, courseTitle, deliveryMethod, completedAt, expiresAt, evidenceUrl, notes } = body;

    if (!personnelName?.trim() || !trainingType?.trim() || !courseTitle?.trim() || !completedAt) {
      return NextResponse.json(
        { error: "personnelName, trainingType, courseTitle, completedAt are required" },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(trainingRecords)
      .values({
        organizationId: orgId,
        personnelName: personnelName.trim(),
        personnelEmail: personnelEmail?.trim() || null,
        trainingType: trainingType.trim(),
        courseTitle: courseTitle.trim(),
        deliveryMethod: deliveryMethod?.trim() || null,
        completedAt,
        expiresAt: expiresAt || null,
        evidenceUrl: evidenceUrl?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db
      .delete(trainingRecords)
      .where(and(eq(trainingRecords.id, id), eq(trainingRecords.organizationId, orgId)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
