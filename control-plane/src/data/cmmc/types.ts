/**
 * TypeScript types for Evidence Engine artifacts.
 * Do not hardcode registers or controls; all data comes from artifact files.
 */

// ============== Evidence Map (cmmc_l2_register_evidence_map.v1.json) ==============
export interface EvidenceMapFramework {
  name: string;
  profile: string;
  control_id_format: string;
}

export interface EvidenceMapRegister {
  id: string;
  name: string;
  cadence_hint: string;
}

export interface ControlOperationalEvidence {
  register_entries_required: boolean;
  cadence_hint: string | null;
}

export interface EvidenceMapControl {
  control_id: string;
  family: string;
  registers: string[];
  operational_evidence: ControlOperationalEvidence;
  notes: string;
}

export interface EvidenceMap {
  schema: string;
  framework: EvidenceMapFramework;
  registers: EvidenceMapRegister[];
  controls: EvidenceMapControl[];
}

// ============== Register Entry Schemas (register_entry_schemas.v1.json) ==============
export interface RegisterEntryType {
  type: string;
  short_help: string;
  required: string[];
  optional: string[];
  enums: Record<string, string[]>;
  recommended_attachments: string[];
  /**
   * Optional auditor-defensible verbosity hooks introduced by the
   * Register-Automation v1.1 brief (§1). Most existing entry types
   * leave these undefined and rely on `required` alone; new entry
   * types (e.g. privileged_grant_acknowledgment) declare both the
   * finalize-time field set and the ISSO-verify-time field set.
   */
  required_at_finalize?: string[];
  required_at_isso_verified?: string[];
}

export interface RegisterSchema {
  register_id: string;
  description: string;
  default_cadence_days: number;
  entry_types: RegisterEntryType[];
}

export interface RegisterEntrySchemas {
  schema: string;
  version: string;
  registerSchemas: RegisterSchema[];
}

// ============== Register Cadence Rules (register_cadence_rules.v1.json) ==============
export interface RegisterCadenceRule {
  register_id: string;
  cadence_type: string;
  cadence_days: number;
  warning_days: number;
  expected_entries_per_year: number;
  notes?: string;
}

export interface RegisterCadenceRules {
  schema: string;
  version: string;
  defaults?: {
    due_soon_days?: number;
    health_states?: string[];
    notes?: string;
  };
  rules: RegisterCadenceRule[];
}

// ============== Control Responsibility Templates (control_responsibility_templates.v1.json) ==============
export type ResponsibilityModel =
  | "azure_inherited"
  | "mactech_provided"
  | "customer_managed"
  | "shared";

export interface ControlResponsibilityTemplate {
  control_id: string;
  family: string;
  responsibility_model: ResponsibilityModel;
  azure_inherited: string[];
  mactech_provided: string[];
  customer_required: string[];
  evidence_registers: string[];
  notes: string[];
}

export interface ControlResponsibilityTemplates {
  schema: string;
  version: string;
  assumptions?: {
    reference_offering?: string;
    responsibility_models?: string[];
    note?: string;
  };
  controls: ControlResponsibilityTemplate[];
}

// ============== Control Assessment Logic (control_assessment_logic.v1.json) ==============
export interface ControlRegisterRequirement {
  register_id: string;
  min_final_entries: number;
  cadence_days: number;
}

export interface ControlScoringDef {
  pass: string;
  partial: string;
  fail: string;
}

export interface ControlAssessmentControl {
  control_id: string;
  family: string;
  requires_operational_evidence: boolean;
  register_requirements: ControlRegisterRequirement[];
  scoring: ControlScoringDef;
  /** Canonical QMS document numbers that satisfy this control's governance lane.
   *  At least one must be APPROVED in governance_documents for hasApprovedGovDocs
   *  to return true. Populated from the canonical doc→control mapping.
   *  Controls with no specific procedure doc have SSP-024 as the sole entry. */
  required_governance_doc_ids?: string[];
}

export interface ControlAssessmentLogic {
  schema: string;
  version: string;
  defaults?: {
    cadence_window_days?: number;
    min_final_entries_per_register?: number;
    due_soon_days?: number;
  };
  controls: ControlAssessmentControl[];
}

// ============== SSP Narrative Templates (ssp_narrative_templates.v1.json) ==============
export interface SSPNarrativeControl {
  control_id: string;
  family: string;
  mapped_registers: string[];
  template_mdx: string;
}

export interface SSPNarrativeTemplates {
  schema: string;
  version: string;
  generated_at?: string;
  placeholders: Record<string, string>;
  controls: SSPNarrativeControl[];
}

// ============== Field Labels and Summaries (register_field_labels_and_summaries.v1.json) ==============
export interface FieldLabelsAndSummaries {
  schema: string;
  version: string;
  description?: string;
  fields: Record<string, string>;
  summary_templates: Record<string, Record<string, string>>;
}
