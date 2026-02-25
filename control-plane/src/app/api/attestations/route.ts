import { NextResponse } from "next/server";
import { db } from "@/db";
import { attestations, controlRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const body = await req.json();
    const { attestationType, resourceType, resourceId, dataHash, comment } = body;
    if (!attestationType || !resourceType || !resourceId) {
      return NextResponse.json(
        { error: "attestationType, resourceType, resourceId required" },
        { status: 400 }
      );
    }
    const [row] = await db
      .insert(attestations)
      .values({
        organizationId: orgId,
        attestationType,
        resourceType,
        resourceId,
        signatoryId: user.id!,
        dataHash: dataHash ?? null,
        comment: typeof comment === "string" ? comment : null,
      })
      .returning();
    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "attestation.create",
      resourceType: "attestation",
      resourceId: row?.id,
      details: { attestationType, resourceType, resourceId },
    });
    // When attesting to a control record, update its lastValidationDate so health/next-due reflects the attestation
    if (resourceType === "control_record" && resourceId) {
      await db
        .update(controlRecords)
        .set({ lastValidationDate: new Date(), updatedAt: new Date() })
        .where(and(eq(controlRecords.id, resourceId), eq(controlRecords.organizationId, orgId)));
    }
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const resourceType = searchParams.get("resourceType");
    const resourceId = searchParams.get("resourceId");
    const rows = await db.select().from(attestations).where(eq(attestations.organizationId, orgId));
    let filtered = rows;
    if (resourceType) filtered = filtered.filter((r) => r.resourceType === resourceType);
    if (resourceId) filtered = filtered.filter((r) => r.resourceId === resourceId);
    return NextResponse.json(filtered);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
