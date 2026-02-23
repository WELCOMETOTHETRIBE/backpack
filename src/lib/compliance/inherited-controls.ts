/**
 * Computes which controls are satisfied by the selected cloud provider (inherited from FedRAMP).
 * Used during onboarding to show "Congratulations" and to set controlRecords.implementationStatus = 'inherited'.
 */
import { technicalEvidenceRequirements } from "./technical_evidence_requirements";

const CLOUD_PROVIDER_KEYS = ["azure_gov", "aws_govcloud"] as const;
const CLOUD_LABELS: Record<string, string> = {
  azure_gov: "Azure Government FedRAMP High Authorization",
  aws_govcloud: "AWS GovCloud (US) FedRAMP Authorization",
};

export type InheritedControl = { controlId: string; inheritedFrom: string };

/**
 * Returns controls that are inherited given the user's selected technologies.
 * A control is inherited if the profile includes a cloud provider (azure_gov or aws_govcloud)
 * and that control has at least one technical requirement with inherited: true for that provider.
 */
export function getInheritedControls(
  selectedTechnologies: string[]
): InheritedControl[] {
  const cloudSelected = CLOUD_PROVIDER_KEYS.filter((k) =>
    selectedTechnologies.includes(k)
  );
  if (cloudSelected.length === 0) return [];

  const seen = new Map<string, string>();
  for (const entry of technicalEvidenceRequirements) {
    for (const cloud of cloudSelected) {
      const list = entry.variants[cloud];
      if (!Array.isArray(list)) continue;
      const hasInherited = list.some((r) => r.inherited === true);
      if (hasInherited && !seen.has(entry.controlId)) {
        seen.set(
          entry.controlId,
          list.find((r) => r.inheritedFrom)?.inheritedFrom ??
            CLOUD_LABELS[cloud] ??
            cloud
        );
      }
    }
  }
  return Array.from(seen.entries()).map(([controlId, inheritedFrom]) => ({
    controlId,
    inheritedFrom,
  }));
}
