/**
 * Attestation templates for the Outstanding Controls Wizard.
 *
 * Each template encodes the precise representations a customer signs to close
 * a control under specific architectural conditions. C3PAO examiners read the
 * `attestationStatement`; the customer's signature plus the `conditions`
 * captured here are what defends the disposition.
 *
 * If a `condition` becomes false (e.g., customer adds telework), the platform
 * re-classifies the control to its `fallbackIfConditionFails.fallbackDisposition`
 * (typically PARTIAL with a register) and notifies the compliance owner.
 */

import templates from "@/data/cmmc/attestation_templates.v1.json";

export type AttestationKind =
  | "implemented_attestation"
  | "na_attestation"
  | "customer_attested_inherited";

export interface FallbackIfConditionFails {
  controlIds: string[];
  fallbackDisposition: "implemented" | "partial" | "not_applicable" | "inherited";
  fallbackRegisterSchemaId: string | null;
  actionRequired: string;
}

export interface AttestationTemplate {
  templateId: string;
  kind: AttestationKind;
  title: string;
  summary: string;
  attestationStatement: string;
  conditions: string[];
  fallbackIfConditionFails: FallbackIfConditionFails;
  evidenceProduced: string;
  linkedControlIds: string[];
  recommendedSignatoryRole: "compliance_owner" | "system_owner" | "ciso" | "admin";
  renewalCadenceDays: number;
  c3paoExaminerNote: string;
}

const raw = templates as unknown as { templates: AttestationTemplate[] };

export const ATTESTATION_TEMPLATES: readonly AttestationTemplate[] = raw.templates;

const byTemplateId = new Map<string, AttestationTemplate>(
  raw.templates.map((t) => [t.templateId, t])
);

const byControlId = new Map<string, AttestationTemplate[]>();
for (const t of raw.templates) {
  for (const cid of t.linkedControlIds) {
    const arr = byControlId.get(cid) ?? [];
    arr.push(t);
    byControlId.set(cid, arr);
  }
}

export function getAttestationTemplate(templateId: string): AttestationTemplate | undefined {
  return byTemplateId.get(templateId);
}

export function getAttestationTemplatesForControl(controlId: string): AttestationTemplate[] {
  return byControlId.get(controlId) ?? [];
}

export function getAttestationTemplatesByKind(kind: AttestationKind): AttestationTemplate[] {
  return raw.templates.filter((t) => t.kind === kind);
}

export const ATTESTATION_TEMPLATE_IDS: readonly string[] = raw.templates.map((t) => t.templateId);
