/**
 * Shared control ID normalization for evidence import, control-status, and boundary.
 * Report format: AC.L2-3.1.22 → NIST form: 3.1.22
 */

/** CMMC L2 report control_id pattern (e.g. AC.L2-3.1.22, AU.L2-3.3.5). */
const REPORT_PREFIX = /^[A-Z]+\.L\d-\d\.\d+\.\d+(\.\d+)?$/;

/**
 * Normalize control ID to NIST form (e.g. 3.1.22).
 * - If input matches report form (XX.L2-3.x.x), strip leading "XX.L2-" and return trailing n.n.n.
 * - If input is already NIST form, return as-is.
 * - Always trim whitespace.
 */
export function controlIdToNist(controlId: string): string {
  const trimmed = String(controlId ?? "").trim();
  if (!trimmed) return trimmed;
  if (REPORT_PREFIX.test(trimmed) || trimmed.includes(".L2-3.")) {
    const stripped = trimmed.replace(/^[A-Z]+\.L\d-/, "");
    return stripped || trimmed;
  }
  return trimmed;
}

/**
 * Returns true if the string is in NIST control ID form (e.g. 3.1.22, 3.14.7).
 */
export function isNistControlId(id: string): boolean {
  return /^(?:\d+\.)+\d+$/.test(String(id ?? "").trim());
}
