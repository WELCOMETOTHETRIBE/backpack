import { db } from "@/db";
import {
  controlRecords,
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  artifacts,
  governanceArtifactCompletions,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";

/**
 * CMMC-rigorous per-control adjudication helpers. Single source of truth for
 * "is this control adjudicated" across the dashboard overview card and the
 * readiness checklist.
 *
 * A control counts as adjudicated when:
 *   • implementation_status is `inherited`      — vendor SRM is the evidence
 *   • implementation_status is `not_applicable` — justification is the evidence
 *   • implementation_status is `implemented`/`assessed` AND at least one form
 *     of operational evidence exists across four lanes:
 *       1. Technical lane — control_records.technical_status = "satisfied"
 *          (populated by the OS Collector manifest ingest into
 *          control_evidence_links; surfaces as a persisted boolean on the
 *          control record so we don't requery).
 *       2. Register lane  — ≥1 finalized entry in the register mapped via
 *          CONTROL_INTELLIGENCE.registerSchemaId.
 *       3. Artifact lane  — an artifact row with a file attached
 *          (status ∈ uploaded/approved).
 *       4. Attestation lane — a governance_artifact_completions row
 *          (REFERENCE / ATTESTATION / SYSTEM_POINTER).
 *
 * Hybrid controls (policyDocRequired=true) additionally require both technical
 * AND policy lanes satisfied.
 */

export type ControlRecordRow = {
  id: string;
  controlId: string;
  implementationStatus: string;
  technicalStatus: string;
  policyDocRequired: boolean;
  policyStatus: string;
};

export type AdjudicationContext = {
  registerFinalCounts: Map<string, number>;
  artifactBackedRecordIds: Set<string>;
  attestationBackedRecordIds: Set<string>;
  intelMap: Map<
    string,
    { registerSchemaId: string | null; registerRequired: boolean }
  >;
};

/** Load all three evidence-lane signals for an org in one pass. */
export async function computeAdjudicationContext(
  orgId: string,
  controlRecordIds: string[]
): Promise<AdjudicationContext> {
  // Register final-entry counts by registerKey (across all org boundaries)
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);

  const registerFinalCounts = new Map<string, number>();
  if (boundaryIds.length > 0) {
    const rows = await db
      .select({
        registerKey: governanceRegisters.registerKey,
        cnt: sql<number>`count(${governanceRegisterEntries.id})::int`,
      })
      .from(governanceRegisters)
      .leftJoin(
        governanceRegisterEntries,
        and(
          eq(governanceRegisterEntries.registerId, governanceRegisters.id),
          eq(governanceRegisterEntries.status, "final"),
          inArray(governanceRegisterEntries.boundaryId, boundaryIds)
        )
      )
      .where(eq(governanceRegisters.organizationId, orgId))
      .groupBy(governanceRegisters.registerKey);
    for (const r of rows) registerFinalCounts.set(r.registerKey, Number(r.cnt) || 0);
  }

  // Artifact-backed control records (file attached, active status)
  const artifactBackedRecordIds = new Set<string>();
  if (controlRecordIds.length > 0) {
    const rows = await db
      .select({ controlRecordId: artifacts.controlRecordId })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.organizationId, orgId),
          inArray(artifacts.controlRecordId, controlRecordIds),
          sql`${artifacts.fileUrl} IS NOT NULL`,
          sql`${artifacts.status} NOT IN ('awaiting_upload','expired','superseded')`
        )
      );
    for (const r of rows) artifactBackedRecordIds.add(r.controlRecordId);
  }

  // Attestation-backed control records
  const attestationBackedRecordIds = new Set<string>();
  if (controlRecordIds.length > 0) {
    const rows = await db
      .select({ controlRecordId: governanceArtifactCompletions.controlRecordId })
      .from(governanceArtifactCompletions)
      .where(
        and(
          eq(governanceArtifactCompletions.organizationId, orgId),
          inArray(governanceArtifactCompletions.controlRecordId, controlRecordIds)
        )
      );
    for (const r of rows) attestationBackedRecordIds.add(r.controlRecordId);
  }

  const intelMap = new Map(
    CONTROL_INTELLIGENCE.map((c) => [
      c.controlId,
      { registerSchemaId: c.registerSchemaId, registerRequired: c.registerRequired },
    ])
  );

  return {
    registerFinalCounts,
    artifactBackedRecordIds,
    attestationBackedRecordIds,
    intelMap,
  };
}

/** Does this control have ≥1 form of operational evidence? */
export function hasOperationalEvidence(
  r: ControlRecordRow,
  ctx: AdjudicationContext
): boolean {
  // Technical lane — OS Collector / manifest ingest flips this to "satisfied"
  // when a valid run covers the control.
  if (r.technicalStatus === "satisfied") return true;
  // Register lane
  const intel = ctx.intelMap.get(r.controlId);
  if (intel?.registerSchemaId) {
    if ((ctx.registerFinalCounts.get(intel.registerSchemaId) ?? 0) > 0) return true;
  }
  // Artifact lane
  if (ctx.artifactBackedRecordIds.has(r.id)) return true;
  // Attestation lane
  if (ctx.attestationBackedRecordIds.has(r.id)) return true;
  return false;
}

/** CMMC-rigorous adjudication check — use everywhere. */
export function isControlAdjudicated(
  r: ControlRecordRow,
  ctx: AdjudicationContext
): boolean {
  if (r.implementationStatus === "inherited") return true;
  if (r.implementationStatus === "not_applicable") return true;
  if (
    r.implementationStatus === "implemented" ||
    r.implementationStatus === "assessed"
  ) {
    if (r.policyDocRequired) {
      return (
        r.technicalStatus === "satisfied" &&
        r.policyStatus === "satisfied" &&
        hasOperationalEvidence(r, ctx)
      );
    }
    return hasOperationalEvidence(r, ctx);
  }
  return false;
}

/** Convenience wrapper: load records + context + classify into 4 buckets. */
export async function computeAdjudicationRollup(orgId: string): Promise<{
  records: ControlRecordRow[];
  ctx: AdjudicationContext;
  inherited: number;
  notApplicable: number;
  implementedEvidenced: number;
  outstanding: number;
  total: number;
}> {
  const records = (await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId))) as ControlRecordRow[];

  const ctx = await computeAdjudicationContext(
    orgId,
    records.map((r) => r.id)
  );

  let inherited = 0;
  let notApplicable = 0;
  let implementedEvidenced = 0;
  for (const r of records) {
    if (r.implementationStatus === "inherited") inherited++;
    else if (r.implementationStatus === "not_applicable") notApplicable++;
    else if (isControlAdjudicated(r, ctx)) implementedEvidenced++;
  }
  const total = 110; // NIST 800-171 Rev 2 L2 fixed count
  const outstanding = total - inherited - notApplicable - implementedEvidenced;

  return {
    records,
    ctx,
    inherited,
    notApplicable,
    implementedEvidenced,
    outstanding: Math.max(0, outstanding),
    total,
  };
}
