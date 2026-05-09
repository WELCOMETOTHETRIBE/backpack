/**
 * Deterministic JSON canonicalization for SSP payloads.
 *
 * The SSP's payload_sha256 must be stable: re-running the generator
 * against unchanged evidence MUST produce the same hash. This means
 * the JSON serialization has to be deterministic — sorted object keys,
 * normalized timestamps, no insertion-order dependence.
 *
 * Standard JSON.stringify is NOT deterministic across object key
 * insertion orders. This helper walks the value, sorts every object's
 * keys, and renders Date instances as ISO-8601 strings.
 *
 * The drift-detect endpoint (Phase C2) reuses this to re-canonicalize
 * an evidence row's current state and compare against the SHA-256
 * pinned at SSP generation time.
 */
import { createHash } from "node:crypto";

/**
 * Canonical-form JSON string of `value`. Stable across re-runs.
 *
 *   - object keys sorted lexicographically (recursive)
 *   - Date instances → ISO-8601 string
 *   - undefined keys dropped (matching JSON.stringify behavior)
 *   - null values preserved
 *   - arrays NOT sorted (order is semantically meaningful for SSP
 *     evidence lists, objective verdicts, signoff chains, etc.)
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalForm(value));
}

function canonicalForm(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalForm);
  const out: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined) continue;
    out[k] = canonicalForm(v);
  }
  return out;
}

/**
 * SHA-256 (hex) of the canonicalized JSON.
 */
export function payloadSha256(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
