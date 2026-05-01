/**
 * C3PAO-aligned SCTM satisfaction source bins:
 * - 73 OS: controls met by OS configuration (enclave / windows_server_hardening)
 * - 17 Cloud: 5 inherited (3.10.1–.5) + 12 Azure/Entra validated by
 *   validate_azure_entra.py v1.4+. Reconciled 2026-05-01 — every control here
 *   corresponds to a real validator check, no aspirational claims.
 * - 17 Governance: true governance only (PURE_GOV — policy/documentation)
 * - Hybrid: 31 OS partial (OS + gov docs to close) + delta (not OS/Cloud/N/A/Governance)
 * - 7 N/A: often not applicable (wireless, alternate work sites, VoIP, etc.)
 */

import { ENCLAVE_73_NIST_IDS, ENCLAVE_OS_PARTIAL_31_NIST_IDS } from "@/lib/compliance/os-evidence-manifest";
import { AZURE_ENTRA_7_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import { AZURE_INHERITED_3_10_CONTROL_IDS } from "@/lib/compliance/azure-inherited-controls";
import { LIKELY_NA_CONTROL_IDS } from "@/lib/compliance/likely-na-controls";
import { PURE_GOV_CONTROL_IDS } from "@/lib/governance/seed-data";

/** 73 controls met by OS configuration (enclave baseline). */
export const OS_73_CONTROL_IDS = new Set(ENCLAVE_73_NIST_IDS);

/** 12 controls met by cloud: 5 inherited (3.10.1–3.10.5) + 7 Azure/Entra. */
export const CLOUD_12_CONTROL_IDS = new Set([
  ...AZURE_INHERITED_3_10_CONTROL_IDS,
  ...AZURE_ENTRA_7_CONTROL_IDS,
]);

/** 7 controls often not applicable. */
export const NA_7_CONTROL_IDS = new Set<string>(LIKELY_NA_CONTROL_IDS as readonly string[]);

/** True governance controls (policy/documentation only; 3.4.3 is hybrid so 17). */
export const GOVERNANCE_18_CONTROL_IDS = new Set(PURE_GOV_CONTROL_IDS);

/** 31 controls in the 73 with support_level PARTIAL (OS evidence + gov docs to close). */
export const OS_PARTIAL_31_CONTROL_IDS = new Set(ENCLAVE_OS_PARTIAL_31_NIST_IDS);

export type SatisfactionSource = "os" | "cloud" | "governance" | "hybrid" | "na";

export interface SatisfactionSourceFlags {
  os: boolean;
  cloud: boolean;
  governance: boolean;
  hybrid: boolean;
  /** True when control is in the 7 "often not applicable" list; still has a real satisfaction bin. */
  oftenNotApplicable: boolean;
}

/**
 * Returns which satisfaction-source pills to show for a control.
 * Every control gets a real bin (OS, Cloud, Governance, or Hybrid). The 7 "often N/A" controls
 * get their actual bin (e.g. Hybrid for delta) and oftenNotApplicable: true for a separate N/A badge.
 */
export function getSatisfactionSources(controlId: string): SatisfactionSourceFlags {
  const oftenNotApplicable = NA_7_CONTROL_IDS.has(controlId);
  const os = OS_73_CONTROL_IDS.has(controlId);
  const cloud = CLOUD_12_CONTROL_IDS.has(controlId);
  const governance = GOVERNANCE_18_CONTROL_IDS.has(controlId);
  const osPartial = OS_PARTIAL_31_CONTROL_IDS.has(controlId);
  const hybrid = (os && osPartial) || (!os && !cloud && !governance);

  return { os, cloud, governance, hybrid, oftenNotApplicable };
}

/** Labels for the two hybrid satisfaction criteria (for control card UI). */
export function getHybridCriteriaLabels(controlId: string): { technical: string; governance: string } {
  const osPartial = OS_PARTIAL_31_CONTROL_IDS.has(controlId);
  if (osPartial) {
    return { technical: "OS configuration evidence", governance: "Governance documentation" };
  }
  return { technical: "Technical implementation", governance: "Policy / documentation" };
}

/** C3PAO validation result: tally and any errors. */
export interface C3PAOValidationResult {
  ok: boolean;
  totalControls: number;
  expectedTotal: number;
  tally: {
    os: number;
    cloud: number;
    oftenNotApplicable: number;
    governance: number;
    hybrid: number;
    osAndCloud: number;
  };
  errors: string[];
  warnings: string[];
  osCloudOverlap: string[];
  unassigned: string[];
}

const EXPECTED_OS = 73;
// CLOUD set: 5 inherited (3.10.1–.5) + 12 Azure/Entra validated by
// validate_azure_entra.py v1.4+. Reconciled 2026-05-01 from 12 → 17 to
// match validator's actual coverage. Honest control adjudication: every
// control here corresponds to a real check that runs against real artifacts.
const EXPECTED_CLOUD = 17;
const EXPECTED_NA = 7;
const EXPECTED_GOVERNANCE = 17;
const EXPECTED_OS_PARTIAL = 31;
const EXPECTED_TOTAL_CMMC_L2 = 110;

/**
 * Runs C3PAO validation: ensures satisfaction-source bins add up, every control
 * is assigned, 18 Governance, 31 OS partial (Hybrid), etc.
 */
export function runC3PAOValidation(allControlIds: string[]): C3PAOValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const osCloudOverlap: string[] = [];
  const unassigned: string[] = [];

  let countOs = 0;
  let countCloud = 0;
  let countOftenNotApplicable = 0;
  let countGovernance = 0;
  let countHybrid = 0;
  let countOsAndCloud = 0;

  for (const controlId of allControlIds) {
    const s = getSatisfactionSources(controlId);
    if (s.os) countOs++;
    if (s.cloud) countCloud++;
    if (s.oftenNotApplicable) countOftenNotApplicable++;
    if (s.governance) countGovernance++;
    if (s.hybrid) countHybrid++;
    if (s.os && s.cloud) countOsAndCloud++;

    const hasAny = s.os || s.cloud || s.governance || s.hybrid;
    if (!hasAny) unassigned.push(controlId);

    if (s.os && s.cloud) osCloudOverlap.push(controlId);
  }

  if (OS_73_CONTROL_IDS.size !== EXPECTED_OS) {
    errors.push(`OS set size is ${OS_73_CONTROL_IDS.size}, expected ${EXPECTED_OS}`);
  }
  if (CLOUD_12_CONTROL_IDS.size !== EXPECTED_CLOUD) {
    errors.push(`Cloud set size is ${CLOUD_12_CONTROL_IDS.size}, expected ${EXPECTED_CLOUD}`);
  }
  if (NA_7_CONTROL_IDS.size !== EXPECTED_NA) {
    errors.push(`N/A set size is ${NA_7_CONTROL_IDS.size}, expected ${EXPECTED_NA}`);
  }
  if (GOVERNANCE_18_CONTROL_IDS.size !== EXPECTED_GOVERNANCE) {
    errors.push(`Governance set size is ${GOVERNANCE_18_CONTROL_IDS.size}, expected ${EXPECTED_GOVERNANCE}`);
  }
  if (OS_PARTIAL_31_CONTROL_IDS.size !== EXPECTED_OS_PARTIAL) {
    errors.push(`OS partial (31) set size is ${OS_PARTIAL_31_CONTROL_IDS.size}, expected ${EXPECTED_OS_PARTIAL}`);
  }

  if (allControlIds.length !== EXPECTED_TOTAL_CMMC_L2) {
    warnings.push(
      `Total control list has ${allControlIds.length} controls; CMMC L2 expected ${EXPECTED_TOTAL_CMMC_L2}`
    );
  }

  if (unassigned.length > 0) {
    errors.push(`Controls with no satisfaction source: ${unassigned.join(", ")}`);
  }

  if (countGovernance !== EXPECTED_GOVERNANCE) {
    errors.push(`Governance count is ${countGovernance}, expected ${EXPECTED_GOVERNANCE}`);
  }

  return {
    ok: errors.length === 0,
    totalControls: allControlIds.length,
    expectedTotal: EXPECTED_TOTAL_CMMC_L2,
    tally: {
      os: countOs,
      cloud: countCloud,
      oftenNotApplicable: countOftenNotApplicable,
      governance: countGovernance,
      hybrid: countHybrid,
      osAndCloud: countOsAndCloud,
    },
    errors,
    warnings,
    osCloudOverlap,
    unassigned,
  };
}
