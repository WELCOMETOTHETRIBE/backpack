import { db } from "@/db";
import {
  controlRecords,
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  artifacts,
  governanceArtifactCompletions,
  evidenceRuns,
  evidenceFindings,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { ENCLAVE_73_NIST_IDS } from "@/lib/compliance/os-evidence-manifest";
import { AZURE_ENTRA_15_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import { controlIdToNist } from "@/lib/compliance/controlId";

/**
 * Controls that BOTH the OS pipeline and the Azure/Entra pipeline have a
 * legitimate claim on (defense-in-depth, Bin 5 of the canonical partition).
 * Each control's actual enforcement spans both layers — e.g. 3.13.5 is the
 * Azure NSG, 3.5.3 is Entra Conditional Access — so OS evidence alone proves
 * only half the story. These stay PARTIAL until BOTH pipelines have produced
 * a passing finding for the control.
 *
 * Computed as OS_73 ∩ AZURE_15. As either set evolves (new validator checks,
 * new OS-manifest entries) this constraint auto-updates without further code
 * changes.
 */
export const NEEDS_BOTH_PIPELINES_CONTROL_IDS: ReadonlySet<string> = new Set(
  AZURE_ENTRA_15_CONTROL_IDS.filter((id) => new Set(ENCLAVE_73_NIST_IDS).has(id))
);

/** True if OS evidence alone is insufficient — need cloud evidence too. */
export function needsBothPipelines(controlId: string): boolean {
  return NEEDS_BOTH_PIPELINES_CONTROL_IDS.has(controlId);
}

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
  /** Set of seed-data registerKeys the org has a governance_registers row for. */
  provisionedRegisterKeys: Set<string>;
  artifactBackedRecordIds: Set<string>;
  attestationBackedRecordIds: Set<string>;
  /**
   * NIST-format control IDs (e.g. "3.13.5") with at least one PASS finding
   * from an azure_entra-source evidence run. Used to enforce the "needs both
   * pipelines" constraint for the 11 dual-coverage controls — see
   * NEEDS_BOTH_PIPELINES_CONTROL_IDS.
   */
  cloudPipelineSatisfiedNistIds: Set<string>;
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
  const provisionedRegisterKeys = new Set<string>();
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
    for (const r of rows) {
      registerFinalCounts.set(r.registerKey, Number(r.cnt) || 0);
      provisionedRegisterKeys.add(r.registerKey);
    }
  } else {
    // Still capture provisioned keys even without boundaries so event-driven
    // lane-satisfaction works (e.g. during initial setup).
    const rows = await db
      .select({ registerKey: governanceRegisters.registerKey })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));
    for (const r of rows) provisionedRegisterKeys.add(r.registerKey);
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

  // Cloud pipeline (azure_entra) PASSes — used to gate the 11 OS+Azure
  // dual-pipeline controls so they don't adjudicate on OS evidence alone.
  const cloudPipelineSatisfiedNistIds = new Set<string>();
  const cloudFindings = await db
    .select({ controlId: evidenceFindings.controlId, pass: evidenceFindings.pass })
    .from(evidenceFindings)
    .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.source, "azure_entra"),
        eq(evidenceFindings.pass, true),
      ),
    );
  for (const f of cloudFindings) {
    // Findings store CMMC-format IDs (e.g. AC.L2-3.1.13); normalize to NIST.
    cloudPipelineSatisfiedNistIds.add(controlIdToNist(f.controlId));
  }

  const intelMap = new Map(
    CONTROL_INTELLIGENCE.map((c) => [
      c.controlId,
      { registerSchemaId: c.registerSchemaId, registerRequired: c.registerRequired },
    ])
  );

  return {
    registerFinalCounts,
    provisionedRegisterKeys,
    artifactBackedRecordIds,
    attestationBackedRecordIds,
    cloudPipelineSatisfiedNistIds,
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
  // Register lane — try every alias (schema id vs seed-data registerKey) so
  // we find counts on whichever vocabulary the DB row used. For event-driven
  // registers (cadence_days=0), zero entries while provisioned is the correct
  // steady state and counts as lane evidence.
  const intel = ctx.intelMap.get(r.controlId);
  if (intel?.registerSchemaId) {
    const candidates = resolveRegisterKeyCandidates(intel.registerSchemaId);
    for (const k of candidates) {
      if ((ctx.registerFinalCounts.get(k) ?? 0) > 0) return true;
    }
    const cadence = getCadenceRuleByRegisterId(intel.registerSchemaId);
    if (cadence?.cadence_days === 0) {
      const provisioned = candidates.some((k) => ctx.provisionedRegisterKeys.has(k));
      if (provisioned) return true;
    }
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
    // Defense-in-depth gate: 11 controls live in BOTH the OS pipeline and the
    // Azure pipeline. OS evidence alone is not enough — the actual enforcement
    // mechanism (NSG, Conditional Access, Key Vault, etc.) is on the Azure
    // side. Stay PARTIAL until cloud evidence (validate_azure_entra) has also
    // produced a passing finding.
    if (
      needsBothPipelines(r.controlId) &&
      !ctx.cloudPipelineSatisfiedNistIds.has(r.controlId)
    ) {
      return false;
    }
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
