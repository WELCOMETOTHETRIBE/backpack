import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlImplementations, controls, controlFamilies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const familyCode = searchParams.get("family");
    const status = searchParams.get("status");

    const impls = await db
      .select({
        id: controlImplementations.id,
        controlId: controlImplementations.controlId,
        status: controlImplementations.status,
        implementationNarrative: controlImplementations.implementationNarrative,
        monitoringCadence: controlImplementations.monitoringCadence,
        lastValidationDate: controlImplementations.lastValidationDate,
        policySopRefs: controlImplementations.policySopRefs,
        control: {
          controlId: controls.controlId,
          nistReqId: controls.nistReqId,
          title: controls.title,
          familyCode: controlFamilies.code,
          familyName: controlFamilies.name,
        },
      })
      .from(controlImplementations)
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
      .where(eq(controlImplementations.organizationId, orgId));

    let filtered = impls;
    if (familyCode) {
      filtered = filtered.filter((r) => r.control.familyCode === familyCode);
    }
    if (status) {
      filtered = filtered.filter((r) => r.status === status);
    }

    return NextResponse.json(filtered);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
