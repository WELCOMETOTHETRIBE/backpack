/**
 * Evidence Engine authoritative data.
 * All registers and controls come from artifact files; do not hardcode.
 */
export { getEvidenceMap, evidenceMap } from "./evidence-map";
export {
  getRegisterSchemas,
  getRegisterSchemaByRegisterId,
  registerSchemas,
} from "./register-schemas";
export {
  getFieldLabelsAndSummaries,
  getFieldLabel,
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
  fieldLabelsAndSummaries,
} from "./field-labels-and-summaries";
export { getControlAssessmentLogic, assessmentLogic } from "./control-assessment-logic";
export { getRegisterCadenceRules, getCadenceRuleByRegisterId, cadenceRules } from "./register-cadence-rules";
export { getControlResponsibilityTemplates, getResponsibilityByControlId, responsibilityTemplates } from "./control-responsibility-templates";
export { getSSPNarrativeTemplates, sspTemplates } from "./ssp-narrative-templates";
export type {
  EvidenceMap,
  EvidenceMapControl,
  EvidenceMapRegister,
  EvidenceMapFramework,
  ControlOperationalEvidence,
  RegisterEntrySchemas,
  RegisterSchema,
  RegisterEntryType,
  FieldLabelsAndSummaries,
  RegisterCadenceRules,
  RegisterCadenceRule,
  ControlResponsibilityTemplates,
  ControlResponsibilityTemplate,
  ResponsibilityModel,
  ControlAssessmentLogic,
  ControlAssessmentControl,
  ControlRegisterRequirement,
  ControlScoringDef,
  SSPNarrativeTemplates,
  SSPNarrativeControl,
} from "./types";
