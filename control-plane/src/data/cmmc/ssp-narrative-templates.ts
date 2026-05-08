import sspTemplatesJson from "./ssp_narrative_templates.v1.json";
import type { SSPNarrativeTemplates } from "./types";

const sspTemplates = sspTemplatesJson as SSPNarrativeTemplates;

/**
 * Returns the SSP narrative templates artifact (110 controls, template_mdx per control).
 * Use for generating SSP draft MDX with placeholder substitution.
 */
export function getSSPNarrativeTemplates(): SSPNarrativeTemplates {
  return sspTemplates;
}

export { sspTemplates };
