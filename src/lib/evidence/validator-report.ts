/**
 * Validates normalized validator report schema (azure_entra, windows_server_hardening).
 * Used by evidence import to accept report payloads.
 */

export type ValidatorReportCheck = {
  control: string;
  pass: boolean;
  observed: string;
  expected: string;
  evidence_hint: string;
  evidence_files_used: string[];
  provider_or_customer: "provider" | "customer" | "shared";
  layer: string | null;
  details?: Record<string, unknown>;
};

export type ValidatorReport = {
  validator: { name: string; version: string; sha256?: string };
  inputs: Array<{ filename: string; sha256?: string; size?: number; mtime_utc?: string }>;
  checks: ValidatorReportCheck[];
};

export function isValidatorReport(r: unknown): r is ValidatorReport {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (!o.validator || typeof o.validator !== "object") return false;
  const v = o.validator as Record<string, unknown>;
  if (typeof v.name !== "string" || typeof v.version !== "string") return false;
  if (!Array.isArray(o.checks)) return false;
  for (const c of o.checks) {
    if (!c || typeof c !== "object") return false;
    if (typeof (c as Record<string, unknown>).control !== "string") return false;
    if (typeof (c as Record<string, unknown>).pass !== "boolean") return false;
    const poc = (c as Record<string, unknown>).provider_or_customer;
    if (poc !== "provider" && poc !== "customer" && poc !== "shared") return false;
    const efu = (c as Record<string, unknown>).evidence_files_used;
    if (!Array.isArray(efu)) return false;
  }
  return true;
}
