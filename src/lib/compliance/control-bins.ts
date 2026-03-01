/**
 * C3PAO-aligned canonical 4-bin partition of all 110 NIST SP 800-171 Rev 2 controls.
 * Single source of truth for Governance and Technical dashboard tallies and control lists.
 * Bins: Pure Technical (OS/Azure), Pure Governance, Hybrid-technical, Hybrid-governance.
 * N/A and Inherited are assigned into one of these four bins (no separate bucket).
 */

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { PURE_GOV_CONTROL_IDS } from "@/lib/governance/seed-data";
import {
  ENCLAVE_73_NIST_IDS,
  ENCLAVE_OS_PARTIAL_31_NIST_IDS,
} from "@/lib/compliance/os-evidence-manifest";
import { AZURE_INHERITED_3_10_CONTROL_IDS } from "@/lib/compliance/azure-inherited-controls";
import { AZURE_ENTRA_7_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";

const OS_73 = new Set(ENCLAVE_73_NIST_IDS);
const OS_PARTIAL_31 = new Set(ENCLAVE_OS_PARTIAL_31_NIST_IDS);
const CLOUD_12 = new Set([
  ...AZURE_INHERITED_3_10_CONTROL_IDS,
  ...AZURE_ENTRA_7_CONTROL_IDS,
]);
const PURE_GOV = new Set(PURE_GOV_CONTROL_IDS);

export type ControlBin =
  | "pure_technical"
  | "pure_governance"
  | "hybrid_technical"
  | "hybrid_governance";

/** 18 controls satisfied only by policy/documentation (C3PAO governance-adjudicated). */
export const PURE_GOVERNANCE_IDS: string[] = [...PURE_GOV_CONTROL_IDS];

/** 31 controls: OS evidence + governance docs to close (enclave manifest PARTIAL). */
export const HYBRID_TECHNICAL_IDS: string[] = ALL_CONTROL_IDS.filter(
  (id) => !PURE_GOV.has(id) && OS_73.has(id) && OS_PARTIAL_31.has(id)
);

/** 48 controls: satisfied entirely by technical implementation (OS STRONG or Cloud/Azure/Inherited). */
export const PURE_TECHNICAL_IDS: string[] = ALL_CONTROL_IDS.filter((id) => {
  if (PURE_GOV.has(id)) return false;
  if (OS_73.has(id) && OS_PARTIAL_31.has(id)) return false;
  return CLOUD_12.has(id) || (OS_73.has(id) && !OS_PARTIAL_31.has(id));
});

/** 14 controls: hybrid satisfied more by governance (policy/docs + technical; not in OS 73, not Cloud 12, not PURE_GOV). */
export const HYBRID_GOVERNANCE_IDS: string[] = ALL_CONTROL_IDS.filter((id) => {
  if (PURE_GOV.has(id)) return false;
  if (OS_73.has(id) && OS_PARTIAL_31.has(id)) return false;
  if (CLOUD_12.has(id) || (OS_73.has(id) && !OS_PARTIAL_31.has(id)))
    return false;
  return true;
});

const PURE_GOVERNANCE_SET = new Set(PURE_GOVERNANCE_IDS);
const HYBRID_TECHNICAL_SET = new Set(HYBRID_TECHNICAL_IDS);
const PURE_TECHNICAL_SET = new Set(PURE_TECHNICAL_IDS);
const HYBRID_GOVERNANCE_SET = new Set(HYBRID_GOVERNANCE_IDS);

/**
 * Returns the canonical C3PAO-aligned bin for a control.
 * Use for Governance/Technical page tallies and control list filtering.
 */
export function getControlBin(controlId: string): ControlBin {
  if (PURE_GOVERNANCE_SET.has(controlId)) return "pure_governance";
  if (HYBRID_TECHNICAL_SET.has(controlId)) return "hybrid_technical";
  if (PURE_TECHNICAL_SET.has(controlId)) return "pure_technical";
  if (HYBRID_GOVERNANCE_SET.has(controlId)) return "hybrid_governance";
  return "hybrid_governance";
}

/** True if control is in any hybrid bin (for SCTM Hybrid pill / box). */
export function isHybridControl(controlId: string): boolean {
  return (
    HYBRID_TECHNICAL_SET.has(controlId) || HYBRID_GOVERNANCE_SET.has(controlId)
  );
}

const EXPECTED_TOTAL = 110;

/**
 * Validates that the 4 bins partition all 110 controls (disjoint, sum = 110).
 * Call from tests or a validation script.
 */
export function validateControlBins(): {
  ok: boolean;
  total: number;
  expected: number;
  counts: { pure_technical: number; pure_governance: number; hybrid_technical: number; hybrid_governance: number };
  errors: string[];
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const id of PURE_GOVERNANCE_IDS) {
    if (seen.has(id)) errors.push(`Duplicate in pure_governance: ${id}`);
    seen.add(id);
  }
  for (const id of HYBRID_TECHNICAL_IDS) {
    if (seen.has(id)) errors.push(`Duplicate in hybrid_technical: ${id}`);
    seen.add(id);
  }
  for (const id of PURE_TECHNICAL_IDS) {
    if (seen.has(id)) errors.push(`Duplicate in pure_technical: ${id}`);
    seen.add(id);
  }
  for (const id of HYBRID_GOVERNANCE_IDS) {
    if (seen.has(id)) errors.push(`Duplicate in hybrid_governance: ${id}`);
    seen.add(id);
  }
  const missing = ALL_CONTROL_IDS.filter((id) => !seen.has(id));
  if (missing.length) errors.push(`Missing from bins: ${missing.join(", ")}`);
  const total =
    PURE_GOVERNANCE_IDS.length +
    HYBRID_TECHNICAL_IDS.length +
    PURE_TECHNICAL_IDS.length +
    HYBRID_GOVERNANCE_IDS.length;
  if (total !== EXPECTED_TOTAL)
    errors.push(`Total ${total}, expected ${EXPECTED_TOTAL}`);
  return {
    ok: errors.length === 0,
    total,
    expected: EXPECTED_TOTAL,
    counts: {
      pure_technical: PURE_TECHNICAL_IDS.length,
      pure_governance: PURE_GOVERNANCE_IDS.length,
      hybrid_technical: HYBRID_TECHNICAL_IDS.length,
      hybrid_governance: HYBRID_GOVERNANCE_IDS.length,
    },
    errors,
  };
}
