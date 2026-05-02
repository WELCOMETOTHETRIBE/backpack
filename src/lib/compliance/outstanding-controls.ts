/**
 * MacTech CUI Vault — Outstanding-36 canonical lookup.
 *
 * Single source of truth for the 74-adjudicated / 36-outstanding split that drives
 * the dashboard "Path to 110" widget and the Outstanding Controls Wizard.
 *
 * The 74/36 split assumes a CUI Vault customer who has:
 *   - Ingested OS evidence from Collect-Cui-Evidence-v2.ps1 (Win 2025 Datacenter baseline)
 *   - Signed the MacTech governance bundle (50+ policies/SOPs)
 *   - Confirmed Azure Government as the cloud host
 *
 * After those three steps:
 *   74 adjudicated  = 68 IMPLEMENTED + 6 INHERITED (full 3.10 family from Azure FedRAMP High)
 *   36 outstanding  = 26 PARTIAL (need register/attestation evidence) + 10 N/A (need attestation)
 *
 * Snapshot reconciled from MacTech_CUI_Vault_Control_Intelligence_Matrix.xlsx.
 * The 10 disposition_overrides_vs_control_intelligence in the snapshot represent
 * C3PAO-defensible corrections that should be applied to control-intelligence.ts in Phase A.5.
 */

import snapshot from "@/data/cmmc/outstanding_36_snapshot.v1.json";

export type OutstandingBucket = "A" | "B" | "C" | "D" | "E";

export interface OutstandingControlEntry {
  controlId: string;
  bucket: OutstandingBucket;
  title: string;
  primaryAction: string;
  effortMinutes: number;
  registerSchemaId?: string;
  registerSchemaExists?: boolean;
  attestationTemplateId?: string;
  trainingCourseId?: string;
  newSchemaProposed?: string;
  operationalEvidence?: string;
}

export interface InheritedControlEntry {
  controlId: string;
  title: string;
  source: string;
  rationale: string;
}

export interface NotApplicableControlEntry {
  controlId: string;
  title: string;
  rationale: string;
}

export interface DispositionOverride {
  controlId: string;
  from: "implemented" | "partial" | "not_applicable" | "inherited";
  to: "implemented" | "partial" | "not_applicable" | "inherited";
  reason: string;
}

export interface CustomerAttestedInherited {
  controlId: string;
  intelligenceDisposition: "partial";
  snapshotDisposition: "inherited";
  attestationTemplateId: string;
  fallbackRegisterSchemaId: string;
  reason: string;
}

const raw = snapshot as unknown as {
  totals: {
    total: number;
    implemented: number;
    partial: number;
    not_applicable: number;
    inherited: number;
    adjudicated: number;
    outstanding: number;
  };
  outstanding_controls: OutstandingControlEntry[];
  inherited_controls: (InheritedControlEntry & {
    requiresCustomerAttestation?: boolean;
    attestationTemplateId?: string;
  })[];
  not_applicable_controls: NotApplicableControlEntry[];
  architecture_static_disposition_overrides: DispositionOverride[];
  customer_attested_inherited: CustomerAttestedInherited[];
  register_schema_gaps: { registerSchemaId: string; neededFor: string[]; phase: string }[];
  attestation_templates_needed: { templateId: string; neededFor: string[]; phase: string }[];
  bucket_summary: Record<string, { count: number; controls: string[] }>;
};

export const OUTSTANDING_TOTALS = raw.totals;

export const OUTSTANDING_36_CONTROL_IDS: readonly string[] = raw.outstanding_controls.map(
  (c) => c.controlId
);

export const INHERITED_6_CONTROL_IDS: readonly string[] = raw.inherited_controls.map(
  (c) => c.controlId
);

export const NOT_APPLICABLE_10_CONTROL_IDS: readonly string[] = raw.not_applicable_controls.map(
  (c) => c.controlId
);

const closePathByControlId = new Map<string, OutstandingControlEntry>(
  raw.outstanding_controls.map((c) => [c.controlId, c])
);

export const OUTSTANDING_CLOSE_PATHS: ReadonlyMap<string, OutstandingControlEntry> = closePathByControlId;

const inheritedByControlId = new Map<string, InheritedControlEntry>(
  raw.inherited_controls.map((c) => [c.controlId, c])
);

const notApplicableByControlId = new Map<string, NotApplicableControlEntry>(
  raw.not_applicable_controls.map((c) => [c.controlId, c])
);

const dispositionOverridesByControlId = new Map<string, DispositionOverride>(
  raw.architecture_static_disposition_overrides.map((d) => [d.controlId, d])
);

const customerAttestedInheritedByControlId = new Map<string, CustomerAttestedInherited>(
  raw.customer_attested_inherited.map((c) => [c.controlId, c])
);

/**
 * Disposition overrides that are STATIC for the MacTech CUI Vault architecture.
 * Apply these to src/data/cmmc/control-intelligence.ts so the in-code intelligence
 * map matches the snapshot. These are not customer-dependent — they reflect the
 * fixed MacTech architecture (no physical media, no on-prem maintenance, etc.).
 */
export const ARCHITECTURE_STATIC_DISPOSITION_OVERRIDES = raw.architecture_static_disposition_overrides;

/**
 * Controls that the snapshot lists as INHERITED but where the underlying
 * intelligence disposition is PARTIAL. Inheritance is conditional on a
 * customer attestation — see attestationTemplateId. If the customer cannot
 * attest, the control reverts to PARTIAL with the fallbackRegisterSchemaId.
 *
 * These are NOT applied to control-intelligence.ts — they stay PARTIAL there.
 * The wizard captures the customer's attestation and updates control_records.
 */
export const CUSTOMER_ATTESTED_INHERITED = raw.customer_attested_inherited;

/**
 * Backwards-compat alias. Combines architecture-static + customer-attested
 * for callers that just want "what's different from control-intelligence".
 */
export const DISPOSITION_OVERRIDES = [
  ...raw.architecture_static_disposition_overrides,
  ...raw.customer_attested_inherited.map((c) => ({
    controlId: c.controlId,
    from: c.intelligenceDisposition,
    to: c.snapshotDisposition,
    reason: c.reason,
  })),
];

export const REGISTER_SCHEMA_GAPS = raw.register_schema_gaps;

export const ATTESTATION_TEMPLATES_NEEDED = raw.attestation_templates_needed;

export const BUCKET_SUMMARY = raw.bucket_summary;

export function getOutstandingClosePath(controlId: string): OutstandingControlEntry | undefined {
  return closePathByControlId.get(controlId);
}

export function getInheritedEntry(controlId: string): InheritedControlEntry | undefined {
  return inheritedByControlId.get(controlId);
}

export function getNotApplicableEntry(controlId: string): NotApplicableControlEntry | undefined {
  return notApplicableByControlId.get(controlId);
}

export function getDispositionOverride(controlId: string): DispositionOverride | undefined {
  return dispositionOverridesByControlId.get(controlId);
}

export function getCustomerAttestedInherited(controlId: string): CustomerAttestedInherited | undefined {
  return customerAttestedInheritedByControlId.get(controlId);
}

export function isCustomerAttestedInherited(controlId: string): boolean {
  return customerAttestedInheritedByControlId.has(controlId);
}

export function isOutstanding(controlId: string): boolean {
  return closePathByControlId.has(controlId);
}

export function isInheritedFromAzure(controlId: string): boolean {
  return inheritedByControlId.has(controlId);
}

export function isNotApplicableForVault(controlId: string): boolean {
  return notApplicableByControlId.has(controlId);
}

export function getOutstandingByBucket(bucket: OutstandingBucket): OutstandingControlEntry[] {
  return raw.outstanding_controls.filter((c) => c.bucket === bucket);
}

export function getOutstandingControlsSorted(): OutstandingControlEntry[] {
  return [...raw.outstanding_controls].sort((a, b) => {
    const bucketOrder = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    if (a.bucket !== b.bucket) return bucketOrder[a.bucket] - bucketOrder[b.bucket];
    return a.effortMinutes - b.effortMinutes;
  });
}

/**
 * Controls that need a signed attestation before they can be considered
 * adjudicated. Bucket C (signed-attestation-required) is the canonical case:
 * 3.3.5, 3.8.1, 3.8.3, 3.13.3 -- the technical config exists but a C3PAO
 * needs the signed declaration that the architectural property holds. Bucket
 * E (N/A attestations) is also gated -- without the signed N/A attestation,
 * the assessor has no defensible justification for excluding the control.
 *
 * Used by calculateControlStatus to hold these as in_progress until the
 * customer signs. Without this gate, the governance manifest's policy-doc
 * fallback was prematurely flipping bucket C controls to "implemented" the
 * moment the signed bundle landed -- contradicting the assessor's actual
 * requirement that the customer themselves attest to the condition.
 */
const ATTESTATION_GATED_CONTROL_IDS = new Set<string>(
  raw.outstanding_controls
    .filter((c) => (c.bucket === "C" || c.bucket === "E") && Boolean(c.attestationTemplateId))
    .map((c) => c.controlId),
);

export function requiresAttestationGate(controlId: string): boolean {
  return ATTESTATION_GATED_CONTROL_IDS.has(controlId);
}
