import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, artifacts, roles, evidenceRuns, evidenceFindings } from "@/db/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

/** Normalize report control_id (e.g. AC.L2-3.1.1) to NIST form (3.1.1). */
function controlIdToNist(controlId: string): string {
  return controlId.replace(/^[A-Z]+\.L2-/, "") || controlId;
}

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
        sprs31311Condition: controlRecords.sprs31311Condition,
        lastValidationDate: controlRecords.lastValidationDate,
        monitoringCadence: controlRecords.monitoringCadence,
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

    // Enrich with evidencePartial from latest 73-check run (controls that passed but need gov docs)
    const latestRunWithFindings = await db
      .select({ id: evidenceRuns.id })
      .from(evidenceRuns)
      .where(
        and(
          eq(evidenceRuns.organizationId, orgId),
          eq(evidenceRuns.source, "windows_server_hardening")
        )
      )
      .orderBy(desc(evidenceRuns.collectedAt))
      .limit(1);

    let partialControlIds = new Set<string>();
    if (latestRunWithFindings.length > 0) {
      const findings = await db
        .select({ controlId: evidenceFindings.controlId, partial: evidenceFindings.partial })
        .from(evidenceFindings)
        .where(
          and(
            eq(evidenceFindings.evidenceRunId, latestRunWithFindings[0].id),
            eq(evidenceFindings.partial, true)
          )
        );
      for (const f of findings) {
        partialControlIds.add(controlIdToNist(f.controlId));
      }
    }

    const enriched = withArtifactCount.map((r) => ({
      ...r,
      evidencePartial: partialControlIds.has(r.controlId),
    }));

    return NextResponse.json(enriched);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list control records";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
