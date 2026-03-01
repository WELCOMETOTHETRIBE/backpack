/**
 * Boundary engine type definitions.
 * LayerId is a string; runtime Set<LayerId> is built from ontology in validators.
 */

export type LayerId = string;

export type ControlAllocationStatus =
  | "Inherited"
  | "Shared"
  | "Customer"
  | "NotApplicable";

export type HostingModel = "on_prem" | "iaas" | "paas" | "saas";

export type GateAnswer = "unknown" | "yes" | "no";

export type AllocationRule =
  | "never_inherited"
  | "always_inherited"
  | "service_covered"
  | "default_allocation";

/** Default allocation per hosting model for a control when no provider/service rule applies. */
export interface DefaultAllocation {
  on_prem: ControlAllocationStatus;
  iaas: ControlAllocationStatus;
  paas: ControlAllocationStatus;
  saas: ControlAllocationStatus;
}

export interface ControlRegistryItem {
  control_id: string;
  family: string;
  title: string;
  layer: LayerId;
  /** Metadata only; engine uses only layer for allocation. */
  secondary_layers?: LayerId[];
  inheritable_possible: boolean;
  default_allocation: DefaultAllocation;
}

/** Provider profile JSON shape (e.g. microsoft_azure_government_iaas.v1.json). */
export interface ProviderProfileServiceEntry {
  display_name: string;
  category: string;
  coverage_layers: string[];
  allocation_effect: string;
  gating_requirements?: string[];
  notes?: string[];
}

export interface ProviderProfile {
  profile_id: string;
  provider: string;
  cloud: string;
  environment: string;
  service_model: string;
  /** Declares IaaS/PaaS/SaaS for documentation and future branching; engine does not branch on it for v1. */
  cloud_model?: "IaaS" | "PaaS" | "SaaS";
  layer_ontology_version: string;
  /** If present, must exactly match ontology.version. */
  ontology_semver?: string;
  always_inherited_layers: string[];
  never_inherited_layers: string[];
  default_customer_layers_in_iaas: string[];
  services: Record<string, ProviderProfileServiceEntry>;
  assurance?: {
    fedramp_expected?: boolean;
    fedramp_level_target?: string;
    notes?: string[];
    evidence_sources?: string[];
  };
  shared_responsibility_reference?: {
    model?: string;
    notes?: string[];
  };
  evidence_expectations?: {
    provider_inheritance?: string[];
    customer_configuration?: string[];
  };
}

/** Per-layer coverage strength when coverage[] is used. */
export type CoverageStrength = "platform" | "operational";

export interface LayerCoverageItem {
  layer: LayerId;
  strength: CoverageStrength;
}

/** Catalog service entry (azure_gov_services_to_layers). */
export interface ServiceCatalogEntry {
  service_key: string;
  display_name: string;
  type: string;
  coverage_layers: string[];
  /** If present, used for which layers + strength; else coverage_layers with no strength. */
  coverage?: LayerCoverageItem[];
  allocation_effect: string;
  notes?: string[];
  ui?: {
    category: string;
    default_enabled: boolean;
  };
}

export interface ServiceCatalog {
  catalog_id: string;
  provider_profile_id: string;
  version: string;
  /** Must equal ontology.ontology_id. */
  layer_ontology_version: string;
  /** If present, must exactly match ontology.version. */
  ontology_semver?: string;
  services: ServiceCatalogEntry[];
  rules?: Record<string, unknown>;
}

/** Gate checklist service entry. */
export interface GateChecklistServiceEntry {
  service_key: string;
  required_gates: string[];
  optional_gates: string[];
  gates: Array<{
    gate_id: string;
    prompt: string;
    type: string;
    evidence_examples?: string[];
  }>;
}

export interface GateChecklist {
  gates_id: string;
  version: string;
  evaluation_model?: {
    gate_states?: string[];
    coverage_rule?: string;
    partial_coverage_rule?: string;
  };
  services: GateChecklistServiceEntry[];
}

/** User-provided boundary definition. hosting_model normalized to lowercase in loader/validator. */
export interface BoundaryInput {
  hosting_model: HostingModel;
  provider: string;
  environment: string;
  os?: string;
  services_enabled: Record<string, boolean>;
  gate_answers: Record<string, GateAnswer>;
  /** Optional explicit exclusions from scope (e.g. "Corporate SSO"). */
  boundary_exclusions?: string[];
  /** Optional explicit inclusions in scope. */
  boundary_inclusions?: string[];
  /** Confirmations for diagram assumption checks (e.g. assume_admin_path_bastion: "yes"). */
  assumption_confirmations?: Record<string, "yes" | "no">;
}

/** Ontology JSON shape (layers_ontology.v1.json). */
export interface LayersOntology {
  ontology_id: string;
  version: string;
  description?: string;
  layers: Array<{
    id: string;
    domain: string;
    description?: string;
    examples?: string[];
  }>;
  rules?: Record<string, string>;
}

export interface AllocationRationale {
  rule: AllocationRule;
  contributing_services: string[];
  /** Service_key -> required gate_ids not "yes". Use for "configured but not creditable" UI. */
  gates_missing_required: Record<string, string[]>;
  /** For Shared + service_covered: first contributing service's strength for this layer, if available. */
  coverage_strength?: CoverageStrength;
}

/** C3PAO-friendly reason shown when status is Shared (why control is not Inherited). */
export type NotInheritedBecause =
  | "customer_configuration_required"
  | "governance_required"
  | "outside_provider_boundary"
  | "shared_platform_operational";

export interface ControlAllocation {
  control_id: string;
  status: ControlAllocationStatus;
  layer: string;
  rationale: AllocationRationale;
  /** FedRAMP/STP category references (metadata only). */
  provider_evidence_refs?: string[];
  /** What the app should ask the customer to upload or generate. */
  customer_evidence_tasks?: string[];
  /** Present when status === "Shared"; explains why not inherited. */
  not_inherited_because?: NotInheritedBecause;
}

export interface AllocationCounts {
  inherited: number;
  shared: number;
  customer: number;
  notApplicable: number;
}

/** Profile-level assurance for UI; prevents assuming Commercial Azure = FedRAMP. */
export interface AssuranceContext {
  provider_assurance_target?: string;
  customer_must_confirm_scope: boolean;
}

export interface SecondaryLayerWarning {
  control_id: string;
  message: string;
}

export interface SensitivityWarning {
  code: string;
  message: string;
}

/** One catalog service that can increase Shared coverage; includes gate counts for UI. */
export interface ServiceForShared {
  service_key: string;
  display_name: string;
  required_gate_count: number;
  optional_gate_count: number;
  coverage_layer_count: number;
}

/** Enabled service that is not creditable for coverage due to missing required gates. */
export interface ConfiguredButNotCreditableRisk {
  service_key: string;
  display_name?: string;
  missing_required_gates: string[];
}

/** Summary for boundary wizard sidebar: inherited count, services for Shared, and risks. */
export interface ProviderCapabilityMatrix {
  inherited_layer_count: number;
  services_for_shared: ServiceForShared[];
  configured_but_not_creditable_risks?: ConfiguredButNotCreditableRisk[];
}

export interface AllocationResult {
  allocations: ControlAllocation[];
  counts: AllocationCounts;
  assurance_context?: AssuranceContext;
  secondary_layer_warnings?: SecondaryLayerWarning[];
  sensitivity_warnings?: SensitivityWarning[];
  /** Deterministic hash of allocation inputs for audit stability and change detection. */
  allocation_hash?: string;
}

/** Thrown by validators on failure. */
export interface ValidationErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export class ValidationError extends Error {
  code: string;
  details?: unknown;

  constructor(params: ValidationErrorDetails) {
    super(params.message);
    this.name = "ValidationError";
    this.code = params.code;
    this.details = params.details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** Result of gate evaluation for a single service. */
export interface ServiceActiveResult {
  active: boolean;
  missing_required: string[];
}
