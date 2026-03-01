import { describe, it, expect } from "vitest";
import { computeSnapshotSignature } from "./computeSnapshotSignature";

const baseInput = {
  boundaryId: "b-1",
  allocationHash: "abc123",
  registryVersion: "1.0",
  providerProfileId: "azure",
  catalogId: "cat-1",
  evidenceRunFingerprints: ["fp1", "fp2"],
};

describe("computeSnapshotSignature", () => {
  it("returns same signature for same input", () => {
    const s1 = computeSnapshotSignature(baseInput);
    const s2 = computeSnapshotSignature(baseInput);
    expect(s1).toBe(s2);
    expect(s1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different signature when coverageHash changes", () => {
    const without = computeSnapshotSignature(baseInput);
    const withCoverage1 = computeSnapshotSignature({
      ...baseInput,
      coverage: { coverageHash: "h1", runFingerprint: "", collectedAt: "" },
    });
    const withCoverage2 = computeSnapshotSignature({
      ...baseInput,
      coverage: { coverageHash: "h2", runFingerprint: "", collectedAt: "" },
    });
    expect(without).not.toBe(withCoverage1);
    expect(withCoverage1).not.toBe(withCoverage2);
  });

  it("returns different signature when runFingerprint or collectedAt in coverage change", () => {
    const c = { coverageHash: "h", runFingerprint: "fp", collectedAt: "2025-01-01T00:00:00Z" };
    const s1 = computeSnapshotSignature({ ...baseInput, coverage: c });
    const s2 = computeSnapshotSignature({
      ...baseInput,
      coverage: { ...c, runFingerprint: "fp2" },
    });
    const s3 = computeSnapshotSignature({
      ...baseInput,
      coverage: { ...c, collectedAt: "2025-01-02T00:00:00Z" },
    });
    expect(s1).not.toBe(s2);
    expect(s1).not.toBe(s3);
  });

  it("same signature when coverage omitted vs empty strings", () => {
    const noCoverage = computeSnapshotSignature(baseInput);
    const emptyCoverage = computeSnapshotSignature({
      ...baseInput,
      coverage: { coverageHash: "", runFingerprint: "", collectedAt: "" },
    });
    expect(noCoverage).toBe(emptyCoverage);
  });
});
