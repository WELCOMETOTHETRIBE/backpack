import { describe, it, expect } from "vitest";

import { isFinalizedAssessmentWithinFrequencyWindow } from "./ra-311-lifecycle-gate";

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
