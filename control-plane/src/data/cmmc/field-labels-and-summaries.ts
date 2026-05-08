import fieldLabelsJson from "./register_field_labels_and_summaries.v1.json";
import type { FieldLabelsAndSummaries } from "./types";

const fieldLabelsAndSummaries = fieldLabelsJson as FieldLabelsAndSummaries;

/**
 * Returns human-readable field labels and summary templates for register entries.
 * Use for UI labels (e.g. approved_at → "Approval Date") and row summary rendering.
 */
export function getFieldLabelsAndSummaries(): FieldLabelsAndSummaries {
  return fieldLabelsAndSummaries;
}

/**
 * Get human label for a field key. Falls back to raw key if not in artifact.
 */
export function getFieldLabel(fieldKey: string): string {
  return fieldLabelsAndSummaries.fields[fieldKey] ?? fieldKey;
}

/**
 * Universal "no events this period" attestation summary. The attestation is
 * register-agnostic (it can be filed against any event-driven register), so a
 * single template here keeps the row body readable without polluting every
 * per-register block in the JSON artifact.
 */
const NO_EVENTS_ATTESTATION_TEMPLATE =
  "No-events attestation for {{period_start}}…{{period_end}} (signed by {{attested_by_name}}).";

/**
 * Get summary template for register_id and entry_type.
 * Returns null if no template (caller should use fallback).
 * Note: summary_templates may use keys like "vuln_detected" while schema uses "vulnerability_detected".
 */
export function getSummaryTemplate(
  registerId: string,
  entryType: string
): string | null {
  if (entryType === "no_events_attestation") return NO_EVENTS_ATTESTATION_TEMPLATE;
  const byRegister = fieldLabelsAndSummaries.summary_templates[registerId];
  if (!byRegister) return null;
  return byRegister[entryType] ?? null;
}

/**
 * Render a summary string by substituting {{field_name}} with values from data.
 */
export function renderSummary(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return v != null ? String(v) : "";
  });
}

/**
 * Get a fallback one-line summary when no template exists (e.g. entry_type + first few fields).
 */
export function getFallbackSummary(
  entryType: string,
  data: Record<string, unknown>,
  maxFields = 2
): string {
  const parts: string[] = [entryType.replace(/_/g, " ")];
  const keys = Object.keys(data).filter((k) => data[k] != null && data[k] !== "");
  for (let i = 0; i < Math.min(maxFields, keys.length); i++) {
    parts.push(String(data[keys[i]]));
  }
  return parts.join(" · ");
}

export { fieldLabelsAndSummaries };
