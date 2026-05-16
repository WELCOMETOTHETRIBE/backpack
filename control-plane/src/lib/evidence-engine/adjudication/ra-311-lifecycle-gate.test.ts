import { describe, it, expect } from "vitest";

import {
  isFinalizedAssessmentWithinFrequencyWindow,
  isSyntheticAssessment,
} from "./ra-311-lifecycle-gate";

describe("isFinalizedAssessmentWithinFrequencyWindow", () => {
  it("returns false when finalizedAt is missing", () => {
    expect(
      isFinalizedAssessmentWithinFrequencyWindow(
        { finalizedAt: null, definedFrequencyDays: 365 },
        new Date("2026-06-01"),
      ),
    ).toBe(false);
  });

  it("passes when assessment is within declared frequency (cap 366)", () => {
    const finalizedAt = new Date("2026-05-01");
    const now = new Date("2026-06-01");
    expect(
      isFinalizedAssessmentWithinFrequencyWindow(
        { finalizedAt, definedFrequencyDays: 365 },
        now,
      ),
    ).toBe(true);
  });

  it("fails when assessment age exceeds defined frequency", () => {
    const finalizedAt = new Date("2026-01-01");
    const now = new Date("2026-06-01");
    expect(
      isFinalizedAssessmentWithinFrequencyWindow(
        { finalizedAt, definedFrequencyDays: 90 },
        now,
      ),
    ).toBe(false);
  });
});

describe("isSyntheticAssessment", () => {
  it("flags [SMOKE] in assessmentName", () => {
    expect(
      isSyntheticAssessment({
        assessmentName: "[SMOKE] MacTech CUI Vault — bridge sync test",
        systemBoundaryName: null,
        sspReference: null,
      }),
    ).toBe(true);
  });
  it("flags (smoke) in systemBoundaryName", () => {
    expect(
      isSyntheticAssessment({
        assessmentName: "MacTech ARA",
        systemBoundaryName: "MacTech CUI Vault (smoke)",
        sspReference: null,
      }),
    ).toBe(true);
  });
  it("flags smoke-test phrase anywhere", () => {
    expect(
      isSyntheticAssessment({
        assessmentName: null,
        systemBoundaryName: null,
        sspReference: "MacTech-SSP-v3.2 §4.2 (smoke-test reference)",
      }),
    ).toBe(true);
  });
  it("passes a real assessment with no markers", () => {
    expect(
      isSyntheticAssessment({
        assessmentName: "FY26 Annual Risk Assessment",
        systemBoundaryName: "MacTech CUI Vault — Production",
        sspReference: "MacTech-SSP-v3.2 §4.2",
      }),
    ).toBe(false);
  });
  it("does NOT flag legitimate uses of the word 'smoke' outside brackets", () => {
    // "Smoke detection" appearing in a long narrative shouldn't trip; the
    // markers all require brackets/parens or the explicit smoke-test phrase.
    expect(
      isSyntheticAssessment({
        assessmentName: "Annual Assessment — includes fire/smoke detection scope",
        systemBoundaryName: null,
        sspReference: null,
      }),
    ).toBe(false);
  });
});
