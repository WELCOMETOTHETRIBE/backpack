/**
 * Types for CMMC SCTM control data (UI Optimized and Ultimate Onboarding JSON).
 * Ultimate includes compliance_meta and assessor_interrogation for a full onboarding/assessment tool.
 */

export interface SctmOptimizedObjective {
  id: string;
  text: string;
}

export interface SctmRequiredArtifact {
  name: string;
  handling: string;
}

export interface SctmComplianceMeta {
  satisfaction_type?: string;
  required_artifacts?: SctmRequiredArtifact[];
}

export interface SctmAssessorInterrogation {
  assessor_questions?: string;
  examine_criteria?: string;
  test_procedures?: string;
}

export interface SctmOptimizedControl {
  id: string;
  title: string;
  summary: string;
  requirement: string;
  nist_guidance: string;
  onboarding_tips: string;
  objectives: SctmOptimizedObjective[];
  scoring: { sprs: number; weight: string };
  classification: { technical: boolean; governance: boolean; hybrid: boolean };
  metadata: {
    domain: string;
    family: string;
    nist_id: string;
    level: string;
  };
  compliance_meta?: SctmComplianceMeta;
  assessor_interrogation?: SctmAssessorInterrogation;
}

/** controlId is 3.x.x (e.g. 3.1.1). JSON uses metadata.nist_id for this. */
export function getOptimizedByControlId(
  list: SctmOptimizedControl[]
): Record<string, SctmOptimizedControl> {
  const map: Record<string, SctmOptimizedControl> = {};
  for (const c of list) {
    const nistId = c.metadata?.nist_id ?? c.id?.replace(/^[A-Z]+\.L2-/, "");
    if (nistId) map[nistId] = c;
  }
  return map;
}

