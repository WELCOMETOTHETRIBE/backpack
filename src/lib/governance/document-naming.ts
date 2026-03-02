/**
 * Parse governance document filenames to infer artifact label and control IDs.
 * Supports: (1) control-prefixed e.g. 3-1.1-Access-Control-Policy-v1.pdf
 *           (2) Codex/MACTech e.g. MAC-SOP-239_System_Monitoring_Procedure.md
 */

import { ALL_CONTROL_IDS, getRequiredUploadArtifactLabels, getControlIdsRequiringUploadLabel } from "@/lib/artifact-guide";
import { getArtifactLabelFromCodexFilename } from "@/lib/governance/governance-document-matrix";

function slug(s: string): string {
  return s
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);
}

/** All unique upload artifact labels, with slug(lower) -> label for matching. */
const SLUG_TO_LABEL: Record<string, string> = (() => {
  const labels = new Set<string>();
  for (const controlId of ALL_CONTROL_IDS) {
    for (const label of getRequiredUploadArtifactLabels(controlId)) {
      labels.add(label);
    }
  }
  const out: Record<string, string> = {};
  for (const label of labels) {
    out[slug(label).toLowerCase()] = label;
  }
  return out;
})();

export interface ParsedGovernanceFilename {
  /** Single control from control-prefixed format (e.g. 3.1.1). */
  controlId?: string;
  /** Inferred artifact label. */
  artifactLabel?: string;
  /** All control IDs to map this document to (from label or single control). */
  controlIds: string[];
}

/**
 * Parse a governance document filename and return inferred controlId, artifactLabel, and controlIds.
 * Tries control-prefixed first (3-1.1-Label-Slug-v1.pdf), then Codex basename (MAC-SOP-239_...).
 */
export function parseGovernanceFilename(filename: string): ParsedGovernanceFilename {
  const basename = filename.replace(/^.*[/\\]/, "").trim();
  const result: ParsedGovernanceFilename = { controlIds: [] };

  // 1) Control-prefixed: 3-1.1-Access-Control-Policy-v1.pdf or 3.1.1-Access-Control-Policy-v1.pdf
  const controlPrefixMatch = basename.match(/^(\d+)[.-](\d+)(?:[.-](\d+))?[.-](.+?)(?:-v\d+)?\.\w+$/i);
  if (controlPrefixMatch) {
    const major = controlPrefixMatch[1];
    const minor = controlPrefixMatch[2];
    const sub = controlPrefixMatch[3];
    const slugPart = controlPrefixMatch[4];
    const controlId = sub ? `${major}.${minor}.${sub}` : `${major}.${minor}`;
    if (ALL_CONTROL_IDS.includes(controlId)) {
      result.controlId = controlId;
      const slugLower = slugPart.replace(/-/g, "").toLowerCase();
      const labelBySlug = SLUG_TO_LABEL[slugPart.toLowerCase()] ?? SLUG_TO_LABEL[slugLower];
      if (labelBySlug) {
        result.artifactLabel = labelBySlug;
        result.controlIds = getControlIdsRequiringUploadLabel(labelBySlug);
      } else {
        result.controlIds = [controlId];
      }
      return result;
    }
  }

  // 2) Codex/MACTech: MAC-SOP-239_System_Monitoring_Procedure.md
  const codexLabel = getArtifactLabelFromCodexFilename(basename);
  if (codexLabel) {
    result.artifactLabel = codexLabel;
    result.controlIds = getControlIdsRequiringUploadLabel(codexLabel);
    return result;
  }

  return result;
}
