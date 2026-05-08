/**
 * Canonical OS Evidence to NIST 800-171 manifest (73 enclave controls).
 * Source: docs/OS-Evidence-to-NIST-Control-Manifest-73-73.json (copy in src/data for app import).
 * Use for enclave control lists, evidence tagging, and governance portal integration.
 */

import manifest from "@/data/os-evidence-nist-manifest.json";
import { PURE_GOV_CONTROL_IDS, HYBRID_GOV_CONTROL_IDS } from "@/lib/governance/seed-data";

export type SupportLevel = "STRONG" | "PARTIAL";

export interface OsEvidenceControlEntry {
  control_id: string;
  nist_req: string;
  title: string;
  support_level: SupportLevel;
  evidence_files: string[];
}

const controls: OsEvidenceControlEntry[] = (manifest as { controls: OsEvidenceControlEntry[] }).controls;

/** All 73 enclave configuration control IDs in NIST req form (e.g. 3.1.1). */
export const ENCLAVE_73_NIST_IDS: string[] = controls.map((c) => c.nist_req);

/** 31 controls in the 73 with support_level PARTIAL (OS evidence + gov docs to close). */
export const ENCLAVE_OS_PARTIAL_31_NIST_IDS: string[] = controls
  .filter((c) => c.support_level === "PARTIAL")
  .map((c) => c.nist_req);

/** By nist_req (3.x.x) for app lookups. */
const byNistReq = new Map<string, OsEvidenceControlEntry>(controls.map((c) => [c.nist_req, c]));

/** By control_id (e.g. AC.L2-3.1.1). */
const byControlId = new Map<string, OsEvidenceControlEntry>(controls.map((c) => [c.control_id, c]));

export const ENCLAVE_CONTROL_COUNT = 73;

/** Control is in the 73 enclave manifest (mapped by OS evidence). */
export function isEnclaveEvidenceMapped(id: string): boolean {
  return byNistReq.has(id) || byControlId.has(id);
}

/** Support level for an enclave control; undefined if not in manifest. */
export function getSupportLevel(id: string): SupportLevel | undefined {
  const c = byNistReq.get(id) ?? byControlId.get(id);
  return c?.support_level;
}

/** Evidence file paths for an enclave control; empty if not in manifest. */
export function getEvidenceFiles(id: string): string[] {
  const c = byNistReq.get(id) ?? byControlId.get(id);
  return c?.evidence_files ?? [];
}

/** Full entry for an enclave control. */
export function getEnclaveEntry(id: string): OsEvidenceControlEntry | undefined {
  return byNistReq.get(id) ?? byControlId.get(id);
}

/** Control is governance-only (17): no OS evidence in 73 manifest. */
export function isGovernanceOnly(id: string): boolean {
  return PURE_GOV_CONTROL_IDS.includes(id) && !byNistReq.has(id);
}

/** Control requires both enclave evidence and governance adjudication (hybrid). */
export function isHybridGovernance(id: string): boolean {
  return HYBRID_GOV_CONTROL_IDS.includes(id);
}

/** All enclave entries for iteration / UI. */
export function getEnclaveControls(): OsEvidenceControlEntry[] {
  return [...controls];
}
