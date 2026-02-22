import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, artifacts, roles } from "@/db/schema";
import { eq, and, like } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

const CONTROL_FAMILY_PREFIX: Record<string, string> = {
  AC: "3.1",
  AT: "3.2",
  AU: "3.3",
  CM: "3.4",
  IA: "3.5",
  IR: "3.6",
  MA: "3.7",
  MP: "3.8",
  PS: "3.9",
  PE: "3.10",
  RA: "3.11",
  CA: "3.12",
  SC: "3.13",
  SI: "3.14",
};

/**
 * GET /api/control-records?family=AC
 * Returns control records for the org, optionally filtered by family code.
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const family = searchParams.get("family");

    if (!family) {
      const existing = await db
        .select({ id: controlRecords.id })
        .from(controlRecords)
        .where(eq(controlRecords.organizationId, orgId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(controlRecords).values(
          ALL_CONTROL_IDS.map((controlId) => ({ organizationId: orgId, controlId }))
        );
      }
    }

    const conditions = family && CONTROL_FAMILY_PREFIX[family]
      ? and(eq(controlRecords.organizationId, orgId), like(controlRecords.controlId, `${CONTROL_FAMILY_PREFIX[family]}.%`))
      : eq(controlRecords.organizationId, orgId);

    const records = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        responsibleRoleId: controlRecords.responsibleRoleId,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(conditions);

    const withArtifactCount = await Promise.all(
      records.map(async (r) => {
        const count = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(eq(artifacts.controlRecordId, r.id));
        return { ...r, artifactCount: count.length };
      })
    );

    return NextResponse.json(withArtifactCount);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list control records";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
