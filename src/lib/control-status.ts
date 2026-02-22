/**
 * Server-side control implementation status calculation.
 * Source of truth: controlRecords.implementationStatus. Called after every artifact upload, delete, narrative save, and technical evidence change.
 */
import { db } from "@/db";
import { controlRecords, artifacts, technicalEvidence, boundaryProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRequiredUploadArtifactLabels } from "./artifact-guide";
import { getEvidenceRequirements } from "./compliance";
import { computeAndPersistSprsScore } from "./sprs";

export type ImplementationStatus = "not_started" | "in_progress" | "implemented" | "assessed";

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

  if (record.implementationStatus === "assessed") {
    return "assessed";
  }

  const controlId = record.controlId;
  const requiredLabels = getRequiredUploadArtifactLabels(controlId);
  const hasNarrative = Boolean(record.governanceNarrative?.trim());

  const existingArtifacts = await db
    .select({ artifactLabel: artifacts.artifactLabel })
    .from(artifacts)
    .where(eq(artifacts.controlRecordId, controlRecordId));

  const uploadedLabels = new Set(existingArtifacts.map((a) => a.artifactLabel));
  const governanceComplete =
    requiredLabels.length === 0
      ? true
      : requiredLabels.every((label) => uploadedLabels.has(label));
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

  const allComplete = governanceDone && technicalComplete;
  const hasSomeProgress =
    existingArtifacts.length > 0 ||
    hasNarrative ||
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
      updatedAt: new Date(),
    })
    .where(eq(controlRecords.id, controlRecordId));

  await computeAndPersistSprsScore(record.organizationId);

  return status;
}
