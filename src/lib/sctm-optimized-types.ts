/**
 * Types for CMMC_SCTM_UI_Optimized.json — 110 controls with title, summary, objectives, scoring, etc.
 * Used by SCTM list and detail to show consistent, readable control content.
 */

export interface SctmOptimizedObjective {
  id: string;
  text: string;
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
}

/** controlId is 3.x.x (e.g. 3.1.1). Optimized JSON uses metadata.nist_id for this. */
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
