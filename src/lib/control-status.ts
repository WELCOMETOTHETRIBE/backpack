/**
 * Server-side control implementation status calculation.
 * Source of truth: controlRecords.implementationStatus. Called after every artifact upload, delete, narrative save, and technical evidence change.
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
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
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

export type ImplementationStatus = "not_started" | "in_progress" | "implemented" | "assessed" | "inherited" | "not_applicable";

/**
 * Recomputes implementationStatus for the given control record and persists it.
 * Logic:
 * - Assessed: leave as assessed.
 * - Governance: all required upload artifacts + narrative.
 * - Technical: when boundary profile exists, all non-inherited technical requirements must have at least one technicalEvidence row with matching requirement_id; inherited requirements are treated as satisfied.
 * - Implemented: governance complete AND technical complete (or no technical requirements).
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
    .select({ artifactLabel: artifacts.artifactLabel })
    .from(artifacts)
    .where(eq(artifacts.controlRecordId, controlRecordId));
  const uploadedLabels = new Set(existingArtifacts.map((a) => a.artifactLabel));

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
  let technicalComplete = true;
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

  // Check OS ingest evidence links — if any successful links exist, technical lane is satisfied
  const evidenceLinks = await db
    .select({ id: controlEvidenceLinks.id })
    .from(controlEvidenceLinks)
    .where(eq(controlEvidenceLinks.controlRecordId, controlRecordId))
    .limit(1);
  const hasEvidenceLinks = evidenceLinks.length > 0;
  if (hasEvidenceLinks) {
    technicalComplete = true;
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
  const effectiveGovernanceComplete = governanceComplete || hasApprovedGovDocs;
  const effectiveGovernanceDone = effectiveGovernanceComplete && (hasNarrative || hasApprovedGovDocs);

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

  // Determine which lanes this control actually requires based on its bin:
  // - Pure Technical (48): only needs technical evidence
  // - Pure Governance (17): only needs governance docs/artifacts
  // - Hybrid (31 + 14): needs both lanes
  const isPureTechnical = PURE_TECHNICAL_IDS.includes(controlId);
  const isPureGovernance = PURE_GOVERNANCE_IDS.includes(controlId);

  let allComplete: boolean;
  if (isPureTechnical) {
    allComplete = technicalComplete; // governance lane not required
  } else if (isPureGovernance) {
    allComplete = effectiveGovernanceDone; // technical lane not required
  } else {
    allComplete = effectiveGovernanceDone && technicalComplete; // hybrid: both required
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
