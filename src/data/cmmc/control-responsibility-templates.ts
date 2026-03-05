import responsibilityTemplatesJson from "./control_responsibility_templates.v1.json";
import type { ControlResponsibilityTemplates, ControlResponsibilityTemplate } from "./types";

const responsibilityTemplates = responsibilityTemplatesJson as ControlResponsibilityTemplates;

/**
 * Returns the control responsibility templates artifact (all 110 controls).
 * MacTech CUI Vault model: azure_inherited, mactech_provided, customer_managed, shared.
 */
export function getControlResponsibilityTemplates(): ControlResponsibilityTemplates {
  return responsibilityTemplates;
}

/** Lookup by control_id. */
export function getResponsibilityByControlId(controlId: string): ControlResponsibilityTemplate | null {
  return responsibilityTemplates.controls.find((c) => c.control_id === controlId) ?? null;
}

export { responsibilityTemplates };
