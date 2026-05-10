import { describe, expect, it } from "vitest";
import {
  classifyBoundaryComponentAdded,
  classifyControlFindingChange,
  classifyEvidenceHashChanged,
  classifyEvidenceRemoved,
  classifyPoamClosedPostBaseline,
  classifyPoamOpenedPostBaseline,
} from "./baseline-drift-rules";

describe("baseline-drift severity classification", () => {
  describe("evidence drift", () => {
    it("evidence hash change is MINOR with no routing flags", () => {
      const c = classifyEvidenceHashChanged();
      expect(c.severity).toBe("minor");
      expect(c.routing.requires_ssp_redraft).toBe(false);
      expect(c.routing.requires_poam_review).toBe(false);
      expect(c.routing.requires_document_control_review).toBe(false);
      expect(c.recommendation).toMatch(/log-only/i);
    });

    it("evidence removed is MODERATE and requires document-control review", () => {
      const c = classifyEvidenceRemoved();
      expect(c.severity).toBe("moderate");
      expect(c.routing.requires_document_control_review).toBe(true);
      expect(c.routing.requires_ssp_redraft).toBe(false);
    });
  });

  describe("control finding drift — material regressions", () => {
    it("MET → NOT_MET is MATERIAL with redraft + POA&M routing", () => {
      const c = classifyControlFindingChange("MET", "NOT_MET");
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
      expect(c.routing.requires_poam_review).toBe(true);
      expect(c.routing.requires_document_control_review).toBe(true);
    });

    it("MET → NA is MATERIAL with redraft (no POA&M needed for N/A)", () => {
      const c = classifyControlFindingChange("MET", "NA");
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
      expect(c.routing.requires_poam_review).toBe(false);
    });

    it("NOT_MET → NA is MATERIAL with redraft (scope changed)", () => {
      const c = classifyControlFindingChange("NOT_MET", "NA");
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
    });

    it("NA → NOT_MET is MATERIAL with redraft + POA&M (left N/A in failed state)", () => {
      const c = classifyControlFindingChange("NA", "NOT_MET");
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
      expect(c.routing.requires_poam_review).toBe(true);
    });

    it("NA → MET is MATERIAL with redraft (no POA&M; control improved into scope)", () => {
      const c = classifyControlFindingChange("NA", "MET");
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
      expect(c.routing.requires_poam_review).toBe(false);
    });
  });

  describe("control finding drift — moderate transitions", () => {
    it("NOT_MET → MET is MODERATE (improvement; SSP not broken)", () => {
      const c = classifyControlFindingChange("NOT_MET", "MET");
      expect(c.severity).toBe("moderate");
      expect(c.routing.requires_ssp_redraft).toBe(false);
    });

    it("unknown/wobble transitions default to MODERATE for review", () => {
      const c = classifyControlFindingChange("partial", "in_progress");
      expect(c.severity).toBe("moderate");
      expect(c.routing.requires_document_control_review).toBe(true);
    });
  });

  describe("control finding drift — case insensitivity", () => {
    it("treats lowercase findings the same as uppercase", () => {
      const upper = classifyControlFindingChange("MET", "NOT_MET");
      const lower = classifyControlFindingChange("met", "not_met");
      const mixed = classifyControlFindingChange("Met", "Not_Met");
      expect(lower.severity).toBe(upper.severity);
      expect(mixed.severity).toBe(upper.severity);
      expect(lower.routing).toEqual(upper.routing);
    });

    it("treats nullish previous/current as 'unknown' (moderate fallback)", () => {
      const c = classifyControlFindingChange(null, "NOT_MET");
      expect(c.severity).toBe("moderate");
    });
  });

  describe("boundary component drift", () => {
    it("component added is MATERIAL with redraft + doc control", () => {
      const c = classifyBoundaryComponentAdded();
      expect(c.severity).toBe("material");
      expect(c.routing.requires_ssp_redraft).toBe(true);
      expect(c.routing.requires_document_control_review).toBe(true);
      expect(c.routing.requires_poam_review).toBe(false);
    });
  });

  describe("POA&M drift", () => {
    it("POA&M opened post-baseline is MODERATE with poam review", () => {
      const c = classifyPoamOpenedPostBaseline();
      expect(c.severity).toBe("moderate");
      expect(c.routing.requires_poam_review).toBe(true);
      expect(c.routing.requires_ssp_redraft).toBe(false);
    });

    it("POA&M closed post-baseline is MODERATE with poam review", () => {
      const c = classifyPoamClosedPostBaseline();
      expect(c.severity).toBe("moderate");
      expect(c.routing.requires_poam_review).toBe(true);
    });
  });

  describe("recommendation strings are operator-actionable", () => {
    // The recommendation field surfaces on the adjudication UI as
    // "what should I do?" guidance. Verify each rule produces a
    // non-empty, action-oriented string.
    const rules = [
      classifyEvidenceHashChanged(),
      classifyEvidenceRemoved(),
      classifyControlFindingChange("MET", "NOT_MET"),
      classifyControlFindingChange("MET", "NA"),
      classifyControlFindingChange("NOT_MET", "MET"),
      classifyBoundaryComponentAdded(),
      classifyPoamOpenedPostBaseline(),
      classifyPoamClosedPostBaseline(),
    ];
    for (const r of rules) {
      it(`${r.severity}/${r.recommendation.slice(0, 32)}…`, () => {
        expect(r.recommendation.length).toBeGreaterThan(10);
      });
    }
  });
});
