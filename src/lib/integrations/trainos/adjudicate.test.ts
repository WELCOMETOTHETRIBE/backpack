import { describe, it, expect } from "vitest";
import { adjudicatePerObjective, rollupOverallVerdict, POLICY_VERSION } from "./adjudicate";
import type { TrainosCanonicalEvidence } from "./types";

function evidence(overrides: Partial<TrainosCanonicalEvidence> = {}): TrainosCanonicalEvidence {
  return {
    courseId: "AT-001-CUI",
    courseTitle: "CMMC CUI Training",
    courseVersion: "1.0.0",
    courseEffectiveDate: "2026-01-01",
    courseContentHash: "sha256:abc",
    controlMappings: [
      { controlId: "AT.L2-3.2.1", objective: "[a]" },
      { controlId: "AT.L2-3.2.1", objective: "[b]" },
      { controlId: "AT.L2-3.2.3", objective: "[a]" },
    ],
    learnerId: "user_1",
    learnerName: "Patrick",
    learnerEmail: "patrick@welcometothetribe.com",
    organizationId: "ten_1",
    assignmentId: "asg_1",
    attemptId: "att_1",
    attemptNumber: 1,
    score: 92,
    passingThreshold: 80,
    passed: true,
    acknowledgement: {
      statements: ["I accept."],
      accepted: true,
      acceptedAt: "2026-05-05T18:22:41.000Z",
    },
    completedAt: "2026-05-05T18:22:41.000Z",
    issuedBySystem: "https://training.mactechsolutionsllc.com",
    ...overrides,
  };
}

describe("adjudicatePerObjective — happy paths", () => {
  it("emits ACCEPTED_WITH_NOTES per mapping when score >= threshold + 10", () => {
    const result = adjudicatePerObjective(evidence({ score: 92, passingThreshold: 80 }));
    expect(result).toHaveLength(3);
    for (const v of result) {
      expect(v.verdict).toBe("ACCEPTED_WITH_NOTES");
      expect(v.remediation).toMatch(/Annual reattest due 2027-05-05/);
    }
  });

  it("emits plain ACCEPTED when score is just above threshold", () => {
    const result = adjudicatePerObjective(evidence({ score: 85, passingThreshold: 80 }));
    expect(result.every((v) => v.verdict === "ACCEPTED")).toBe(true);
    expect(result.every((v) => !v.remediation)).toBe(true);
  });

  it("preserves controlId + objective shape from input mapping", () => {
    const result = adjudicatePerObjective(evidence());
    expect(result.map((v) => `${v.controlId}${v.objective}`)).toEqual([
      "AT.L2-3.2.1[a]",
      "AT.L2-3.2.1[b]",
      "AT.L2-3.2.3[a]",
    ]);
  });
});

describe("adjudicatePerObjective — failure paths", () => {
  it("INSUFFICIENT for every mapping when passed === false", () => {
    const result = adjudicatePerObjective(evidence({ passed: false, score: 95 }));
    expect(result.every((v) => v.verdict === "INSUFFICIENT")).toBe(true);
    expect(result[0].remediation).toMatch(/Re-attempt/);
  });

  it("INSUFFICIENT when score < passingThreshold", () => {
    const result = adjudicatePerObjective(evidence({ score: 70, passingThreshold: 80, passed: true }));
    expect(result.every((v) => v.verdict === "INSUFFICIENT")).toBe(true);
  });

  it("REJECTED for non-AT mapping (bug — should never happen for a training event)", () => {
    const result = adjudicatePerObjective(
      evidence({
        controlMappings: [
          { controlId: "AT.L2-3.2.1", objective: "[a]" },
          { controlId: "AC.L2-3.1.1", objective: "[a]" }, // wrong family
        ],
      })
    );
    expect(result[0].verdict).toBe("ACCEPTED_WITH_NOTES");
    expect(result[1].verdict).toBe("REJECTED");
    expect(result[1].rationale).toMatch(/not in the AT/);
  });
});

describe("rollupOverallVerdict — strictest wins", () => {
  it("REJECTED beats everything", () => {
    expect(
      rollupOverallVerdict([
        { controlId: "AT.L2-3.2.1", objective: "[a]", verdict: "ACCEPTED", rationale: "" },
        { controlId: "X", objective: "[a]", verdict: "REJECTED", rationale: "" },
        { controlId: "AT.L2-3.2.1", objective: "[b]", verdict: "INSUFFICIENT", rationale: "" },
      ])
    ).toBe("REJECTED");
  });

  it("INSUFFICIENT beats ACCEPTED_WITH_NOTES and ACCEPTED", () => {
    expect(
      rollupOverallVerdict([
        { controlId: "AT.L2-3.2.1", objective: "[a]", verdict: "ACCEPTED", rationale: "" },
        { controlId: "AT.L2-3.2.1", objective: "[b]", verdict: "INSUFFICIENT", rationale: "" },
        { controlId: "AT.L2-3.2.1", objective: "[c]", verdict: "ACCEPTED_WITH_NOTES", rationale: "" },
      ])
    ).toBe("INSUFFICIENT");
  });

  it("ACCEPTED_WITH_NOTES beats ACCEPTED only", () => {
    expect(
      rollupOverallVerdict([
        { controlId: "AT.L2-3.2.1", objective: "[a]", verdict: "ACCEPTED", rationale: "" },
        { controlId: "AT.L2-3.2.1", objective: "[b]", verdict: "ACCEPTED_WITH_NOTES", rationale: "" },
      ])
    ).toBe("ACCEPTED_WITH_NOTES");
  });

  it("all ACCEPTED → ACCEPTED", () => {
    expect(
      rollupOverallVerdict([
        { controlId: "AT.L2-3.2.1", objective: "[a]", verdict: "ACCEPTED", rationale: "" },
      ])
    ).toBe("ACCEPTED");
  });

  it("empty per-objective list → REJECTED (malformed mapping)", () => {
    expect(rollupOverallVerdict([])).toBe("REJECTED");
  });
});

describe("POLICY_VERSION is exposed for response telemetry", () => {
  it("is a versioned string", () => {
    expect(POLICY_VERSION).toMatch(/^codex-policy-v\d+\.\d+\.\d+$/);
  });
});
