/**
 * Unified evidence requirements: governance (from artifact guide) + technical (from technical_evidence_requirements, filtered by boundary profile).
 */
import { getSpecForControl, type ArtifactSpec } from "@/lib/artifact-guide";
import {
  technicalEvidenceRequirements,
  type EvidenceRequirement,
} from "./technical_evidence_requirements";

export type BoundaryProfile = { selectedTechnologies: string[] };

/**
 * Map onboarding tech card value keys to existing technical_evidence_requirements variant keys.
 * Enables new onboarding keys (e.g. windows_workstation) to show same evidence as existing keys (windows_11).
 */
const ONBOARDING_KEY_TO_EVIDENCE_KEY: Record<string, string> = {
  windows_workstation: "windows_11",
  // azure_gov, aws_govcloud, windows_server, rhel, macos, entra_id, okta, intune, jamf, defender, crowdstrike, splunk, tenable already exist
};

/**
 * Returns governance artifacts (from artifact guide) and technical evidence requirements
 * (from technical_evidence_requirements, filtered by profile: selected technologies + "all").
 * Dedupes technical requirements by id.
 */
export function getEvidenceRequirements(
  controlId: string,
  profile: BoundaryProfile | null
): { governance: ArtifactSpec[]; technical: EvidenceRequirement[] } {
  const governance = (() => {
    const spec = getSpecForControl(controlId);
    return spec?.artifacts ?? [];
  })();

  const technical = (() => {
    const entry = technicalEvidenceRequirements.find((e) => e.controlId === controlId);
    if (!entry?.variants) return [];

    const keys = new Set<string>(["all"]);
    if (profile?.selectedTechnologies?.length) {
      profile.selectedTechnologies.forEach((k) => {
        keys.add(k);
        const mapped = ONBOARDING_KEY_TO_EVIDENCE_KEY[k];
        if (mapped) keys.add(mapped);
      });
    }

    const seen = new Set<string>();
    const out: EvidenceRequirement[] = [];
    for (const key of keys) {
      const list = entry.variants[key];
      if (!Array.isArray(list)) continue;
      for (const req of list) {
        if (seen.has(req.id)) continue;
        seen.add(req.id);
        out.push(req);
      }
    }
    return out;
  })();

  return { governance, technical };
}
