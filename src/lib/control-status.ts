/**
 * Server-side control implementation status calculation.
 * Source of truth: controlRecords.implementationStatus. Called after every artifact upload, delete, and narrative save.
 */
import { db } from "@/db";
import { controlRecords, artifacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredUploadArtifactLabels } from "./artifact-guide";

export type ImplementationStatus = "not_started" | "in_progress" | "implemented" | "assessed";

/**
 * Recomputes implementationStatus for the given control record and persists it.
 * Logic:
 * - Assessed: leave as assessed (assessor has marked satisfied).
 * - Not Started: no artifacts uploaded, no narrative.
 * - In Progress: at least one artifact or narrative, but not all required artifacts + narrative.
 * - Implemented: all required artifacts (per artifact guide) uploaded and governance narrative present.
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
  const allRequiredUploaded =
    requiredLabels.length === 0
      ? true
      : requiredLabels.every((label) => uploadedLabels.has(label));

  let status: ImplementationStatus = "not_started";
  if (allRequiredUploaded && hasNarrative) {
    status = "implemented";
  } else if (existingArtifacts.length > 0 || hasNarrative) {
    status = "in_progress";
  }

  await db
    .update(controlRecords)
    .set({
      implementationStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(controlRecords.id, controlRecordId));

  return status;
}
