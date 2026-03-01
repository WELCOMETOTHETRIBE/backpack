import { describe, it, expect } from "vitest";
import { computeCoverageHash } from "./coverageHash";
import type { EnclaveCoverageSummary } from "./enclaveCoverage";

function minimalSummary(overrides: Partial<EnclaveCoverageSummary> = {}): EnclaveCoverageSummary {
  return {
    source: "windows_server_hardening",
    evidence_run_id: "run-1",
    run_fingerprint: "fp-abc",
    collected_at: "2025-01-15T00:00:00Z",
    totals: {
      enclave_controls: 2,
      pass_fresh: 1,
      pass_stale: 0,
      pass_unknown_layer: 0,
      fail: 0,
      no_finding: 1,
    },
    rows: [
      {
        control_id: "3.1.1",
        layer: "GuestOS/Hardening",
        bucket: "pass_fresh",
        freshness_status: "fresh",
        freshness_days: 90,
        freshness_cutoff_utc: "2025-04-15T00:00:00Z",
      },
      {
        control_id: "3.1.2",
        layer: null,
        bucket: "no_finding",
        freshness_status: "n/a",
        freshness_days: null,
        freshness_cutoff_utc: null,
      },
    ],
    top_gaps: { unknown_layer: [], stale: [], failed: [], no_finding: ["3.1.2"] },
    ...overrides,
  };
}

describe("computeCoverageHash", () => {
  it("returns same hash for same summary", () => {
    const s = minimalSummary();
    const h1 = computeCoverageHash(s);
    const h2 = computeCoverageHash(s);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different hash when one row bucket changes", () => {
    const s = minimalSummary();
    const h1 = computeCoverageHash(s);
    const s2 = minimalSummary({
      rows: [
        ...s.rows.slice(0, 1),
        { ...s.rows[1], bucket: "fail" as const },
      ],
    });
    const h2 = computeCoverageHash(s2);
    expect(h1).not.toBe(h2);
  });

  it("returns different hash when totals change", () => {
    const s = minimalSummary();
    const h1 = computeCoverageHash(s);
    const s2 = minimalSummary({
      totals: { ...s.totals, pass_fresh: 2, no_finding: 0 },
    });
    const h2 = computeCoverageHash(s2);
    expect(h1).not.toBe(h2);
  });

  it("returns different hash when run_fingerprint changes", () => {
    const s = minimalSummary();
    const h1 = computeCoverageHash(s);
    const h2 = computeCoverageHash(minimalSummary({ run_fingerprint: "fp-xyz" }));
    expect(h1).not.toBe(h2);
  });
});
