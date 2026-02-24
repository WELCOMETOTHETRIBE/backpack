import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceEvidenceItems, governanceEvidenceFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/** GET /api/governance/evidence/[id] */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [item] = await db
      .select()
      .from(governanceEvidenceItems)
      .where(
        and(
          eq(governanceEvidenceItems.organizationId, orgId),
          eq(governanceEvidenceItems.id, id)
        )
      );

    if (!item) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

    const files = await db
      .select()
      .from(governanceEvidenceFiles)
      .where(eq(governanceEvidenceFiles.evidenceItemId, id));

    const validityEnd = item.validityPeriodDays
      ? (() => {
          const d = new Date(item.collectedAt);
          d.setDate(d.getDate() + item.validityPeriodDays);
          return d;
        })()
      : null;

    return NextResponse.json({
      ...item,
      files,
      validityEnd: validityEnd?.toISOString() ?? null,
      isStale: validityEnd ? validityEnd < new Date() : false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/** PATCH /api/governance/evidence/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [item] = await db
      .select()
      .from(governanceEvidenceItems)
      .where(
        and(
          eq(governanceEvidenceItems.organizationId, orgId),
          eq(governanceEvidenceItems.id, id)
        )
      );

    if (!item) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.sourceSystem !== undefined) updates.sourceSystem = body.sourceSystem;
    if (body.validityPeriodDays !== undefined) updates.validityPeriodDays = body.validityPeriodDays;
    if (body.implementationStatement !== undefined) updates.implementationStatement = body.implementationStatement;

    await db
      .update(governanceEvidenceItems)
      .set(updates as Record<string, unknown>)
      .where(eq(governanceEvidenceItems.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
