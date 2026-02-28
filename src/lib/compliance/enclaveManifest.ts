/**
 * Enclave manifest gatekeeper: determines if a control is in the 73 enclave (OS evidence) set.
 * Uses the same canonical manifest as os-evidence-manifest; single source of truth for "enclave-mapped".
 */

import manifest from "@/data/os-evidence-nist-manifest.json";

interface ManifestControl {
  control_id: string;
  nist_req: string;
  title?: string;
  support_level?: string;
  evidence_files?: string[];
}

const controls = (manifest as { controls: ManifestControl[] }).controls;
const nistIdSet = new Set<string>(controls.map((c) => c.nist_req));

/**
 * Returns true if the given NIST control ID (e.g. 3.1.22) is in the 73 enclave manifest.
 */
export function isEnclaveMappedControl(nistControlId: string): boolean {
  return nistIdSet.has(String(nistControlId ?? "").trim());
}

/**
 * All 73 enclave-mapped control IDs in NIST form.
 */
export function getEnclaveMappedControls(): string[] {
  return [...nistIdSet];
}
