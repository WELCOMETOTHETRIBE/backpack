export {
  getEvidenceRequirements,
  type BoundaryProfile,
} from "./evidence_requirements";
export { getInheritedControls, type InheritedControl } from "./inherited-controls";
export {
  getEvidenceFamiliesForScopeComponents,
  type EvidenceFamily,
} from "./scope-component-evidence";
export {
  technicalEvidenceRequirements,
  type ControlEvidenceMap,
  type EvidenceRequirement,
  type EvidenceType,
} from "./technical_evidence_requirements";
export {
  OUTSTANDING_36_CONTROL_IDS,
  INHERITED_6_CONTROL_IDS,
  NOT_APPLICABLE_10_CONTROL_IDS,
  OUTSTANDING_CLOSE_PATHS,
  OUTSTANDING_TOTALS,
  ARCHITECTURE_STATIC_DISPOSITION_OVERRIDES,
  CUSTOMER_ATTESTED_INHERITED,
  DISPOSITION_OVERRIDES,
  REGISTER_SCHEMA_GAPS,
  ATTESTATION_TEMPLATES_NEEDED,
  BUCKET_SUMMARY,
  getOutstandingClosePath,
  getInheritedEntry,
  getNotApplicableEntry,
  getDispositionOverride,
  getCustomerAttestedInherited,
  getOutstandingByBucket,
  getOutstandingControlsSorted,
  isOutstanding,
  isInheritedFromAzure,
  isNotApplicableForVault,
  isCustomerAttestedInherited,
  type OutstandingBucket,
  type OutstandingControlEntry,
  type InheritedControlEntry,
  type NotApplicableControlEntry,
  type DispositionOverride,
  type CustomerAttestedInherited,
} from "./outstanding-controls";
export {
  ATTESTATION_TEMPLATES,
  ATTESTATION_TEMPLATE_IDS,
  getAttestationTemplate,
  getAttestationTemplatesForControl,
  getAttestationTemplatesByKind,
  type AttestationTemplate,
  type AttestationKind,
  type FallbackIfConditionFails,
} from "./attestation-templates";
