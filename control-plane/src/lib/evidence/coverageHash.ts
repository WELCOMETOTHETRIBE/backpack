/**
 * Deterministic SHA-256 hash of enclave coverage summary for attestation binding.
 */

import { createHash } from "crypto";
import type { EnclaveCoverageSummary } from "./enclaveCoverage";

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

/**
 * Canonical payload for hashing: only fields that affect coverage posture.
 * Excludes remediation_hint and top_gaps (derived). Rows already sorted by control_id.
 */
function buildCanonicalPayload(summary: EnclaveCoverageSummary): Record<string, unknown> {
  return {
    source: summary.source,
    evidence_run_id: summary.evidence_run_id,
    run_fingerprint: summary.run_fingerprint,
    collected_at: summary.collected_at,
    totals: summary.totals,
    rows: summary.rows.map((r) => ({
      control_id: r.control_id,
      bucket: r.bucket,
      layer: r.layer ?? null,
      freshness_status: r.freshness_status,
      freshness_cutoff_utc: r.freshness_cutoff_utc ?? null,
    })),
  };
}

/**
 * Returns SHA-256 hex hash of the canonical coverage summary for attestation.
 */
export function computeCoverageHash(summary: EnclaveCoverageSummary): string {
  const payload = buildCanonicalPayload(summary);
  const canonical = stableStringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}
