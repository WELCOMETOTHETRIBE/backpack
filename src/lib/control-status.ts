/**
 * Server-side control implementation status calculation.
 * Source of truth: controlRecords.implementationStatus. Called after every artifact upload, delete, narrative save, technical evidence change, and register entry finalization.
 *
 * A control is "implemented" only when ALL applicable lanes are satisfied:
 *   1. Governance lane: required artifacts + narrative (or approved governance docs)
 *   2. Technical lane: OS/enclave evidence + technical requirements
 *   3. Policy doc lane: linked policy document (for ~18 hybrid controls)
 *   4. Register lane: finalized register entries (for controls that require registers)
 */
import { db } from "@/db";
import {
  controlRecords,
  artifacts,
  technicalEvidence,
  controlEvidenceLinks,
  boundaryProfiles,
  boundarySnapshots,
  governanceArtifactCompletions,
  governanceDocumentControlLinks,
  governanceDocuments,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  getRequiredUploadArtifactLabels,
  getRequiredArtifactSpecs,
  type RequiredArtifactSpec,
} from "./artifact-guide";
import { getEvidenceRequirements } from "./compliance";
import { computeAndPersistSprsScore } from "./sprs";
import { isEnclaveMappedControl } from "./compliance/enclaveManifest";
import { hasPassingFreshEnclaveFinding } from "./evidence/hasPassingFreshFinding";
import {
  PURE_TECHNICAL_IDS,
  PURE_GOVERNANCE_IDS,
} from "./compliance/control-bins";
import { needsBothPipelines } from "./adjudication-helpers";
import { requiresAttestationGate } from "./compliance/outstanding-controls";
import { evidenceRuns, evidenceFindings } from "@/db/schema";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * Controls where policy / procedure documents are NECESSARY but NOT SUFFICIENT
 * to demonstrate implementation — a C3PAO assessor will ask for the execution
 * artifact by name during the Examine method.
 *
 * Each entry names the `client-required-artifacts` milestone key that must
 * have a real file uploaded (status uploaded/approved, fileUrl non-null) for
 * the control to be considered implemented. The milestone placeholder alone
 * (status "awaiting_upload") is not sufficient.
 *
 *   3.6.3 — "Test the organizational incident response capability." Procedure
 *           docs don't prove testing was performed. The AAR from within the
 *           last 12 months is what the assessor examines.
 *
 * Add new controls here sparingly and only when NIST SP 800-171A's assessment
 * objectives clearly require an execution artifact beyond policy.
 */
export const EXECUTION_EVIDENCE_REQUIRED_MILESTONES: Record<string, string> = {
  "3.6.3": "IR.3.6.3.tabletop_aar",
};

export const EXECUTION_EVIDENCE_REQUIRED = new Set<string>(
  Object.keys(EXECUTION_EVIDENCE_REQUIRED_MILESTONES)
);

export interface GovernanceCompletionRow {
  artifactLabel: string;
  artifactType: string;
  valueText: string | null;
  attestedBy: string | null;
  attestedAt: Date | string | null;
}

/** Pure: returns true iff every required artifact is satisfied (uploads or non-upload completions). */
export function isGovernanceComplete(
  requiredSpecs: RequiredArtifactSpec[],
  uploadedLabels: Set<string>,
  completionByLabel: Map<string, GovernanceCompletionRow>
): boolean {
  if (requiredSpecs.length === 0) return true;
  return requiredSpecs.every((spec) => {
    if (spec.type === "UPLOAD" || spec.type === "NATIVE") {
      return uploadedLabels.has(spec.label);
    }
    if (spec.type === "REFERENCE" || spec.type === "SYSTEM_POINTER") {
      const c = completionByLabel.get(spec.label);
      return Boolean(c?.valueText?.trim());
    }
    if (spec.type === "ATTESTATION") {
      const c = completionByLabel.get(spec.label);
      return Boolean(c?.attestedBy && c?.attestedAt);
    }
    return false;
  });
}

async function getLayerForControl(
  organizationId: string,
  controlNistId: string
): Promise<string | null> {
  const [snapshot] = await db
    .select({ snapshotJson: boundarySnapshots.snapshotJson })
    .from(boundarySnapshots)
    .where(eq(boundarySnapshots.accountId, organizationId))
    .orderBy(desc(boundarySnapshots.createdAt))
    .limit(1);
  if (!snapshot?.snapshotJson) return null;
  const allocations = (snapshot.snapshotJson as { allocations?: Array<{ control_id?: string; layer?: string; rationale?: { layer?: string } }> })
    ?.allocations ?? [];
  const alloc = allocations.find((a) => a.control_id === controlNistId);
  return alloc?.layer ?? (alloc?.rationale as { layer?: string } | undefined)?.layer ?? null;
}

// Pre-compute control intelligence lookups
const intelByControlId = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));

/**
 * Check if a control's required register lane is satisfied.
 *
 * Satisfied when either:
 *   a) ≥1 finalized entry exists in the register, OR
 *   b) the register is event-driven (cadence_days = 0) AND provisioned for
 *      the org. Event-driven registers (incident_log, termination,
 *      maintenance_log, change_log, visitor_log, media_destruction,
 *      personnel_screening) legitimately stay empty until the triggering
 *      event occurs — a fresh vault with no incidents is the correct
 *      steady state.
 *
 * Two vocabularies refer to the same register (see
 * register-key-aliases.ts): the schema id held by
 * CONTROL_INTELLIGENCE.registerSchemaId ("termination") and the seed-data
 * registerKey written to governance_registers rows ("terminations"). We
 * try every alias so the register lookup actually finds the row.
 *
 * `technical_compliance_run` is deliberately NOT whitelisted — it is a
 * meta-log of OS Collector runs; "empty" means the collector has never
 * run, which is a gap, not a satisfied state. (It is also not referenced
 * by any control in CONTROL_INTELLIGENCE today, so this is defensive.)
 */
const EVENT_DRIVEN_EXCLUDED_FROM_EMPTY_PASS = new Set<string>(["technical_compliance_run"]);

async function isRegisterSatisfied(
  organizationId: string,
  controlId: string
): Promise<boolean> {
  const intel = intelByControlId.get(controlId);
  if (!intel?.registerRequired || !intel.registerSchemaId) return true; // no register needed

  const candidates = resolveRegisterKeyCandidates(intel.registerSchemaId);

  // Find the register for this org matching any alias vocabulary.
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `
        )})`
      )
    )
    .limit(1);

  if (!register) return false; // register not provisioned

  // Event-driven registers: provisioned with zero entries is the correct
  // steady state — no events means nothing to log. Auto-satisfy.
  const cadence = getCadenceRuleByRegisterId(intel.registerSchemaId);
  const isEventDriven = cadence?.cadence_days === 0;
  if (isEventDriven && !EVENT_DRIVEN_EXCLUDED_FROM_EMPTY_PASS.has(intel.registerSchemaId)) {
    return true;
  }

  // Scheduled register: require at least one finalized entry within the
  // org's boundaries.
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, organizationId));

  if (orgBoundaries.length === 0) return false;

  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        eq(governanceRegisterEntries.status, "final"),
        sql`${governanceRegisterEntries.boundaryId} IN (${sql.join(
          orgBoundaries.map((b) => sql`${b.id}`),
          sql`, `
        )})`
      )
    );

  return (row?.cnt ?? 0) > 0;
}

export type ImplementationStatus = "not_started" | "in_progress" | "implemented" | "assessed" | "inherited" | "not_applicable";

/**
 * Recomputes implementationStatus for the given control record and persists it.
 * Logic:
 * - Assessed/inherited/not_applicable: terminal states — leave as-is.
 * - Governance: all required upload artifacts + narrative (or approved governance docs).
 * - Technical: boundary profile evidence requirements + OS/enclave evidence.
 * - Policy doc: linked policy document for hybrid controls.
 * - Register: finalized register entries for controls that require registers.
 * - Implemented: ALL applicable lanes complete.
 */
export async function calculateControlStatus(controlRecordId: string): Promise<ImplementationStatus> {
  const [record] = await db
    .select()
    .from(controlRecords)
    .where(eq(controlRecords.id, controlRecordId))
    .limit(1);

  if (!record) {
    throw new Error(`Control record not found: ${controlRecordId}`);
  }

  if (
    record.implementationStatus === "assessed" ||
    record.implementationStatus === "inherited" ||
    record.implementationStatus === "not_applicable"
  ) {
    return record.implementationStatus;
  }

  const controlId = record.controlId;
  const requiredSpecs = getRequiredArtifactSpecs(controlId);
  const hasNarrative = Boolean(record.governanceNarrative?.trim());

  const existingArtifacts = await db
    .select({
      artifactLabel: artifacts.artifactLabel,
      milestoneKey: artifacts.milestoneKey,
      fileUrl: artifacts.fileUrl,
      status: artifacts.status,
    })
    .from(artifacts)
    .where(eq(artifacts.controlRecordId, controlRecordId));
  const uploadedLabels = new Set(existingArtifacts.map((a) => a.artifactLabel));

  // For execution-evidence controls we need to know whether a specific
  // milestone artifact is actually uploaded (file present + active status),
  // not just whether a placeholder row exists.
  const hasFileForMilestone = (milestoneKey: string): boolean =>
    existingArtifacts.some(
      (a) =>
        a.milestoneKey === milestoneKey &&
        Boolean(a.fileUrl) &&
        (a.status === "uploaded" || a.status === "approved")
    );

  const completions = await db
    .select({
      artifactLabel: governanceArtifactCompletions.artifactLabel,
      artifactType: governanceArtifactCompletions.artifactType,
      valueText: governanceArtifactCompletions.valueText,
      attestedBy: governanceArtifactCompletions.attestedBy,
      attestedAt: governanceArtifactCompletions.attestedAt,
    })
    .from(governanceArtifactCompletions)
    .where(eq(governanceArtifactCompletions.controlRecordId, controlRecordId));
  const completionByLabel = new Map(
    completions.map((c) => [
      c.artifactLabel,
      {
        artifactLabel: c.artifactLabel,
        artifactType: c.artifactType,
        valueText: c.valueText,
        attestedBy: c.attestedBy,
        attestedAt: c.attestedAt,
      },
    ])
  );

  const governanceComplete = isGovernanceComplete(
    requiredSpecs,
    uploadedLabels,
    completionByLabel
  );
  const governanceDone = governanceComplete && hasNarrative;

  // Technical: get org's boundary profile and requirements for this control
  const [profileRow] = await db
    .select({ selectedTechnologies: boundaryProfiles.selectedTechnologies })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, record.organizationId))
    .limit(1);

  const profile = profileRow
    ? { selectedTechnologies: (profileRow.selectedTechnologies ?? []) as string[] }
    : null;
  const { technical: technicalReqs } = getEvidenceRequirements(controlId, profile);
  const requiredTechnicalIds = technicalReqs.filter((r) => !r.inherited).map((r) => r.id);
  // Default to false ("guilty until proven by evidence"). The earlier default
  // of true was vacuously satisfying the technical lane for any control with
  // NO required technical evidence specs -- e.g. Azure-only controls (3.8.9)
  // and customer-attested-inherited (3.10.3) had no OS specs, defaulted to
  // true, and flipped to implementationStatus='implemented' the moment we
  // ran calculateControlStatus, even though the codex had zero positive
  // technical signal for them. Fixed by requiring at least one of:
  //   - requiredTechnicalIds defined AND all satisfied
  //   - isEnclaveMappedControl with a passing fresh finding (below)
  //   - hasEvidenceLinks from OS ingest (below)
  // For pure-governance bins, the allComplete check doesn't consult
  // technicalComplete, so a default of false is harmless there.
  let technicalComplete = false;
  if (requiredTechnicalIds.length > 0) {
    const evidenceRows = await db
      .select({ requirementId: technicalEvidence.requirementId })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.controlRecordId, controlRecordId));
    const satisfiedIds = new Set(
      evidenceRows.map((r) => r.requirementId).filter((id): id is string => Boolean(id))
    );
    technicalComplete = requiredTechnicalIds.every((id) => satisfiedIds.has(id));
  }

  if (!technicalComplete && isEnclaveMappedControl(controlId)) {
    const layer = await getLayerForControl(record.organizationId, controlId);
    const res = await hasPassingFreshEnclaveFinding({
      db,
      organizationId: record.organizationId,
      controlNistId: controlId,
      layer,
    });
    technicalComplete = technicalComplete || res.ok;
  }

  // Check OS ingest evidence links -- if any successful links exist, technical lane is satisfied
  const evidenceLinks = await db
    .select({ id: controlEvidenceLinks.id })
    .from(controlEvidenceLinks)
    .where(eq(controlEvidenceLinks.controlRecordId, controlRecordId))
    .limit(1);
  const hasEvidenceLinks = evidenceLinks.length > 0;
  if (hasEvidenceLinks) {
    technicalComplete = true;
  }

  // Cloud-side technical evidence: a PASS finding from the Azure validator
  // (validate_azure_entra) counts as positive technical signal -- this is
  // how Azure-only controls (3.1.14, 3.8.9) get their technical lane
  // satisfied (they have no OS-side evidence specs at all), and how
  // dual-pipeline controls satisfy needsBothPipelines.
  if (!technicalComplete) {
    const cloudPass = await db
      .select({ id: evidenceFindings.evidenceRunId })
      .from(evidenceFindings)
      .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
      .where(
        and(
          eq(evidenceRuns.organizationId, record.organizationId),
          eq(evidenceRuns.source, "azure_entra"),
          eq(evidenceFindings.controlId, controlId),
          eq(evidenceFindings.pass, true),
        ),
      )
      .limit(1);
    if (cloudPass.length > 0) {
      technicalComplete = true;
    }
  }

  // Check governance manifest links — if approved (non-DRAFT) docs are mapped to this control,
  // treat the governance document lane as satisfied regardless of individual artifact uploads.
  // This allows the QMS manifest ingest to satisfy governance requirements for hybrid controls.
  const govDocLinks = await db
    .select({ docCode: governanceDocumentControlLinks.docCode })
    .from(governanceDocumentControlLinks)
    .where(
      and(
        eq(governanceDocumentControlLinks.organizationId, record.organizationId),
        eq(governanceDocumentControlLinks.controlId, controlId)
      )
    )
    .limit(10);

  let hasApprovedGovDocs = false;
  if (govDocLinks.length > 0) {
    const docCodes = govDocLinks.map((l) => l.docCode);
    // Check if any of those docs are non-DRAFT
    for (const code of docCodes) {
      const [doc] = await db
        .select({ status: governanceDocuments.status })
        .from(governanceDocuments)
        .where(
          and(
            eq(governanceDocuments.organizationId, record.organizationId),
            eq(governanceDocuments.docId, code)
          )
        )
        .limit(1);
      if (doc && doc.status !== "DRAFT") {
        hasApprovedGovDocs = true;
        break;
      }
    }
  }
  // Governance is complete if: artifacts satisfy specs OR approved governance docs are mapped.
  // Narrative is satisfied if: user wrote one OR governance docs provide the written evidence.
  //
  // EXCEPTION — "execution evidence" controls (see EXECUTION_EVIDENCE_REQUIRED).
  // Policy / procedure docs are NECESSARY but NOT SUFFICIENT for these (e.g.,
  // 3.6.3 needs an IR tabletop AAR; the Testing Procedure alone is not evidence
  // that the testing was performed). A C3PAO's Examine method will ask for the
  // execution artifact by name. For these controls we disable the
  // "hasApprovedGovDocs" fallback so the governance lane only passes when the
  // expected UPLOAD artifact has actually been uploaded.
  const isExecutionEvidenceControl = EXECUTION_EVIDENCE_REQUIRED.has(controlId);
  const effectiveGovernanceComplete = isExecutionEvidenceControl
    ? governanceComplete
    : governanceComplete || hasApprovedGovDocs;
  const effectiveGovernanceDone = isExecutionEvidenceControl
    ? effectiveGovernanceComplete && (hasNarrative || hasApprovedGovDocs)
    : effectiveGovernanceComplete && (hasNarrative || hasApprovedGovDocs);

  // ── Register lane ──
  // Controls flagged as registerRequired in the control intelligence layer must have
  // at least one finalized register entry to be considered "implemented".
  const registerComplete = await isRegisterSatisfied(record.organizationId, controlId);

  // Derive technical_status for the dual-evidence lane.
  // Note: "inherited" and "not_applicable" are returned early above, so they
  // cannot appear here — cast to string to allow comparison without TS narrowing error.
  const implStatus = record.implementationStatus as string;
  const newTechnicalStatus =
    implStatus === "not_applicable" ? "not_applicable"
    : implStatus === "inherited" ? "satisfied"
    : hasEvidenceLinks ? "satisfied"
    : technicalComplete ? "satisfied"
    // SCTM attestation: user explicitly marking a control implemented/assessed
    // counts as satisfying the technical lane (OS evidence is additional verification,
    // not a gate on the user's own attestation).
    : implStatus === "implemented" || implStatus === "assessed" ? "satisfied"
    : "not_started";

  // Execution-evidence controls require a specific artifact file (not just
  // a placeholder row). For 3.6.3 this is the tabletop AAR — no AAR, no
  // implementation, regardless of what policy docs are mapped.
  const executionEvidenceSatisfied = (() => {
    const milestoneKey = EXECUTION_EVIDENCE_REQUIRED_MILESTONES[controlId];
    if (!milestoneKey) return true;
    return hasFileForMilestone(milestoneKey);
  })();

  // Determine which lanes this control actually requires based on its bin:
  // - Pure Technical (48): only needs technical evidence
  // - Pure Governance (17): only needs governance docs/artifacts
  // - Hybrid (31 + 14): needs both lanes
  const isPureTechnical = PURE_TECHNICAL_IDS.includes(controlId);
  const isPureGovernance = PURE_GOVERNANCE_IDS.includes(controlId);

  let allComplete: boolean;
  if (isPureTechnical) {
    allComplete = technicalComplete && registerComplete;
  } else if (isPureGovernance) {
    allComplete = effectiveGovernanceDone && registerComplete;
  } else {
    allComplete = effectiveGovernanceDone && technicalComplete && registerComplete;
  }
  // Execution evidence gate applies on top of the lane checks -- if the
  // specific artifact isn't uploaded, the control cannot be implemented.
  allComplete = allComplete && executionEvidenceSatisfied;

  // Attestation gate: bucket C (signed attestations like
  // architectural-isolation, digital-only-media) and bucket E (N/A
  // attestations like no-wireless) require the customer's signed
  // declaration -- a C3PAO will not accept the policy-doc fallback alone.
  // Hold these in_progress until governance_artifact_completions has a
  // signed row for this control. Once the user clicks "Sign attestation"
  // and we write a row with attestedBy/attestedAt, the gate clears and the
  // next calculateControlStatus call flips them to implemented (or the
  // disposition-override pass flips bucket E controls to N/A).
  if (allComplete && requiresAttestationGate(controlId)) {
    const signed = await db
      .select({ id: governanceArtifactCompletions.id })
      .from(governanceArtifactCompletions)
      .where(
        and(
          eq(governanceArtifactCompletions.controlRecordId, controlRecordId),
          sql`${governanceArtifactCompletions.attestedBy} IS NOT NULL`,
          sql`${governanceArtifactCompletions.attestedAt} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (signed.length === 0) {
      allComplete = false; // hold until customer signs
    }
  }

  // Defense-in-depth gate: 11 controls live in BOTH the OS pipeline and the
  // Azure pipeline (NEEDS_BOTH_PIPELINES_CONTROL_IDS). For these, OS evidence
  // alone isn't enough -- their actual enforcement (NSG, Conditional Access,
  // Key Vault, Entra audit, etc.) is on the Azure side. Hold them as
  // in_progress until cloud evidence (validate_azure_entra) has produced a
  // PASS finding. Without this gate, calculateControlStatus would set
  // implementationStatus='implemented' on these the moment OS evidence
  // landed, contradicting isControlAdjudicated()'s downstream check and
  // splitting the dashboard count from the SCTM filter count.
  if (allComplete && needsBothPipelines(controlId)) {
    const cloudPass = await db
      .select({ id: evidenceFindings.evidenceRunId })
      .from(evidenceFindings)
      .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
      .where(
        and(
          eq(evidenceRuns.organizationId, record.organizationId),
          eq(evidenceRuns.source, "azure_entra"),
          eq(evidenceFindings.controlId, controlId),
          eq(evidenceFindings.pass, true),
        ),
      )
      .limit(1);
    if (cloudPass.length === 0) {
      allComplete = false; // hold as in_progress until cloud evidence is in
    }
  }
  const hasSomeProgress =
    existingArtifacts.length > 0 ||
    hasNarrative ||
    hasApprovedGovDocs ||
    hasEvidenceLinks ||
    (await db
      .select({ id: technicalEvidence.id })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.controlRecordId, controlRecordId))
      .limit(1)
    ).length > 0;

  let status: ImplementationStatus = "not_started";
  if (allComplete) {
    status = "implemented";
  } else if (hasSomeProgress) {
    status = "in_progress";
  }

  await db
    .update(controlRecords)
    .set({
      implementationStatus: status,
      technicalStatus: newTechnicalStatus,
      updatedAt: new Date(),
    })
    .where(eq(controlRecords.id, controlRecordId));

  await computeAndPersistSprsScore(record.organizationId);

  return status;
}
