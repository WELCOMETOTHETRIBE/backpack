import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, artifacts, roles, evidenceRuns, evidenceFindings } from "@/db/schema";
import { eq, and, like, desc, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { controlIdToNist } from "@/lib/compliance/controlId";
import { syncOrgAzureInheritedControls } from "@/lib/compliance/azure-inherited-controls";
import { getSatisfactionSources } from "@/lib/compliance/satisfaction-sources";
import { isHybridControl } from "@/lib/compliance/control-bins";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { governanceRegisters, governanceRegisterEntries, boundaries } from "@/db/schema";
import { sql } from "drizzle-orm";

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
 * GET /api/control-records?family=AC | ?controlIds=3.1.14,3.1.13,...
 * Returns control records for the org, optionally filtered by family code or by control IDs.
 */
export async function GET(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch (authErr) {
    const message = authErr instanceof Error ? authErr.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    // Ensure 3.10.1–3.10.5 inherited status is in sync with any Azure boundary (non-blocking)
    await syncOrgAzureInheritedControls(db, orgId);
  } catch {
    // Sync failure should not block listing control records
  }

  try {
    const { searchParams } = new URL(req.url);
    const family = searchParams.get("family");
    const controlIdsParam = searchParams.get("controlIds");

    const controlIdsList =
      controlIdsParam?.trim()
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? null;

    if (!family && !controlIdsList?.length) {
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
    if (controlIdsList?.length) {
      const existingForIds = await db
        .select({ controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(
          and(eq(controlRecords.organizationId, orgId), inArray(controlRecords.controlId, controlIdsList))
        );
      const existingSet = new Set(existingForIds.map((r) => r.controlId));
      const missing = controlIdsList.filter((id) => !existingSet.has(id));
      if (missing.length > 0) {
        await db.insert(controlRecords).values(
          missing.map((controlId) => ({ organizationId: orgId, controlId }))
        );
      }
    }

    const conditions = controlIdsList?.length
      ? and(eq(controlRecords.organizationId, orgId), inArray(controlRecords.controlId, controlIdsList))
      : family && CONTROL_FAMILY_PREFIX[family]
        ? and(eq(controlRecords.organizationId, orgId), like(controlRecords.controlId, `${CONTROL_FAMILY_PREFIX[family]}.%`))
        : eq(controlRecords.organizationId, orgId);

    type RecordRow = {
      id: string;
      controlId: string;
      implementationStatus: string;
      governanceNarrative: string | null;
      responsibleRoleId: string | null;
      roleName: string | null;
      sprs31311Condition: string | null;
      lastValidationDate: Date | null;
      monitoringCadence: string | null;
      validationMethod: string | null;
      hybridSatisfaction: { technical?: boolean; governance?: boolean } | null;
      technicalStatus: string | null;
      policyDocRequired: boolean;
      policyStatus: string | null;
      policyDocNarrative: string | null;
      policyDocLinkedAt: Date | null;
    };
    let records: RecordRow[];
    try {
      records = await db
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
          validationMethod: controlRecords.validationMethod,
          hybridSatisfaction: controlRecords.hybridSatisfaction,
          technicalStatus: controlRecords.technicalStatus,
          policyDocRequired: controlRecords.policyDocRequired,
          policyStatus: controlRecords.policyStatus,
          policyDocNarrative: controlRecords.policyDocNarrative,
          policyDocLinkedAt: controlRecords.policyDocLinkedAt,
        })
        .from(controlRecords)
        .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
        .where(conditions);
    } catch (selectErr) {
      const msg = selectErr instanceof Error ? selectErr.message : String(selectErr);
      if (msg.includes("hybrid_satisfaction") || msg.includes("technical_status") || msg.includes("policy_doc_required")) {
        const rows = await db
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
            validationMethod: controlRecords.validationMethod,
          })
          .from(controlRecords)
          .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
          .where(conditions);
        records = rows.map((r) => ({
          ...r,
          hybridSatisfaction: null,
          technicalStatus: "not_started",
          policyDocRequired: false,
          policyStatus: "not_required",
          policyDocNarrative: null,
          policyDocLinkedAt: null,
        }));
      } else {
        throw selectErr;
      }
    }

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

    // ── Register satisfaction per control ──
    // Build a map: controlId → boolean (true if all required registers have finalized entries)
    const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
    const orgRegisters = await db
      .select({
        id: governanceRegisters.id,
        registerKey: governanceRegisters.registerKey,
        controlIds: governanceRegisters.controlIds,
      })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));

    const orgBoundaries = await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId));
    const boundaryIds = orgBoundaries.map((b) => b.id);

    // Count finalized entries per register
    const registerFinalCounts = new Map<string, number>();
    if (boundaryIds.length > 0) {
      for (const reg of orgRegisters) {
        const [row] = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(
            and(
              eq(governanceRegisterEntries.registerId, reg.id),
              eq(governanceRegisterEntries.status, "final"),
              sql`${governanceRegisterEntries.boundaryId} IN (${sql.join(
                boundaryIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
          );
        registerFinalCounts.set(reg.registerKey, row?.cnt ?? 0);
      }
    }

    // Build controlId → registerSatisfied map
    const registerSatisfiedMap = new Map<string, boolean>();
    for (const [controlId, intel] of intelMap) {
      if (!intel.registerRequired || !intel.registerSchemaId) {
        registerSatisfiedMap.set(controlId, true); // no register needed
        continue;
      }
      const count = registerFinalCounts.get(intel.registerSchemaId) ?? 0;
      registerSatisfiedMap.set(controlId, count > 0);
    }

    const enriched = withArtifactCount.map((r) => {
      const sources = getSatisfactionSources(r.controlId);
      const intel = intelMap.get(r.controlId);
      return {
        ...r,
        evidencePartial: partialControlIds.has(r.controlId),
        satisfiedByOs: sources.os,
        satisfiedByCloud: sources.cloud,
        satisfiedByGovernance: sources.governance,
        satisfiedByHybrid: isHybridControl(r.controlId),
        oftenNotApplicable: sources.oftenNotApplicable,
        registerRequired: intel?.registerRequired ?? false,
        registerKey: intel?.registerKey ?? null,
        registerSchemaId: intel?.registerSchemaId ?? null,
        registerSatisfied: registerSatisfiedMap.get(r.controlId) ?? true,
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list control records";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
