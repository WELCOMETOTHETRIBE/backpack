import evidenceMapJson from "./cmmc_l2_register_evidence_map.v1.json";
import type { EvidenceMap } from "./types";

const evidenceMap = evidenceMapJson as EvidenceMap;

/**
 * Returns the CMMC L2 evidence map (110 controls, 23 registers, control→register mappings).
 * Treat as authoritative; do not hardcode controls or registers elsewhere.
 */
export function getEvidenceMap(): EvidenceMap {
  return evidenceMap;
}

export { evidenceMap };
