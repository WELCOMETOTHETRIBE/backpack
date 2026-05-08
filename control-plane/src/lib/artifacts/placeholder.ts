import { db } from "@/db";
import { artifacts } from "@/db/schema";
import type { ClientArtifactMilestone } from "@/data/cmmc/client-required-artifacts";
import { createArtifactLink } from "./artifact-links";

export type CreatePlaceholderResult = {
  artifactId: string;
  linkId: string;
};

/** ISO date (YYYY-MM-DD) `offsetDays` from now. */
function dueDateFromOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Create an "awaiting_upload" placeholder artifact anchored to the given
 * control record and immediately link it to the POAM milestone that will
 * consume it. The placeholder carries the catalog's expected metadata so the
 * Artifacts page can render concrete "Upload here" targets on day 0.
 */
export async function createPlaceholderArtifact(params: {
  orgId: string;
  controlRecordId: string;
  milestone: ClientArtifactMilestone;
  poamMilestoneId: string;
}): Promise<CreatePlaceholderResult> {
  const { orgId, controlRecordId, milestone, poamMilestoneId } = params;

  const [artifact] = await db
    .insert(artifacts)
    .values({
      organizationId: orgId,
      controlRecordId,
      artifactLabel: milestone.title,
      status: "awaiting_upload",
      expectedClosureType: milestone.closureType,
      expectedEvidenceType: milestone.evidenceType,
      expectedCadence: milestone.cadence,
      expectedDueDate: dueDateFromOffset(milestone.dueOffsetDays),
      milestoneKey: milestone.key,
    })
    .returning({ id: artifacts.id });

  const link = await createArtifactLink({
    orgId,
    artifactId: artifact.id,
    linkType: "poam_milestone",
    linkTargetId: poamMilestoneId,
  });

  return { artifactId: artifact.id, linkId: link.id };
}
