import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getRequiredUploadArtifactLabels,
} from "@/lib/artifact-guide";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { GovernanceView } from "./GovernanceView";

/** Build map: document label -> list of control IDs that require it (UPLOAD/NATIVE). */
function getRequiredDocumentsByLabel(): Map<string, string[]> {
  const byLabel = new Map<string, string[]>();
  for (const controlId of ALL_CONTROL_IDS) {
    const labels = getRequiredUploadArtifactLabels(controlId);
    for (const label of labels) {
      const list = byLabel.get(label) ?? [];
      if (!list.includes(controlId)) list.push(controlId);
      byLabel.set(label, list);
    }
  }
  return byLabel;
}

export default async function GovernancePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const artifactRows = await db
    .select({ artifactLabel: artifacts.artifactLabel })
    .from(artifacts)
    .where(eq(artifacts.organizationId, orgId));

  const uploadedLabels = new Set(artifactRows.map((r) => r.artifactLabel));
  const requiredByLabel = getRequiredDocumentsByLabel();
  const sortedLabels = [...requiredByLabel.keys()].sort();
  const outstanding = sortedLabels.filter((label) => !uploadedLabels.has(label));
  const uploaded = sortedLabels.filter((label) => uploadedLabels.has(label));

  const requiredByLabelSerializable: Record<string, string[]> = {};
  for (const [label, controlIds] of requiredByLabel) {
    requiredByLabelSerializable[label] = controlIds;
  }

  const documentStats = {
    outstanding,
    uploaded,
    requiredByLabel: requiredByLabelSerializable,
  };

  return <GovernanceView documentStats={documentStats} />;
}
