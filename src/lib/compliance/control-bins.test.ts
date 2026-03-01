import { describe, it, expect } from "vitest";
import {
  validateControlBins,
  getControlBin,
  PURE_GOVERNANCE_IDS,
  PURE_TECHNICAL_IDS,
  HYBRID_TECHNICAL_IDS,
  HYBRID_GOVERNANCE_IDS,
  isHybridControl,
} from "./control-bins";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

describe("control-bins", () => {
  it("partitions all 110 controls into 4 disjoint bins", () => {
    const result = validateControlBins();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.total).toBe(110);
    expect(result.expected).toBe(110);
    expect(
      PURE_GOVERNANCE_IDS.length +
        PURE_TECHNICAL_IDS.length +
        HYBRID_TECHNICAL_IDS.length +
        HYBRID_GOVERNANCE_IDS.length
    ).toBe(110);
  });

  it("returns correct counts: 17 pure gov, 48 pure technical, 31 hybrid technical, 14 hybrid governance", () => {
    const { counts } = validateControlBins();
    expect(counts.pure_governance).toBe(17);
    expect(counts.pure_technical).toBe(48);
    expect(counts.hybrid_technical).toBe(31);
    expect(counts.hybrid_governance).toBe(14);
  });

  it("getControlBin assigns every control to exactly one bin", () => {
    for (const id of ALL_CONTROL_IDS) {
      const bin = getControlBin(id);
      expect(["pure_technical", "pure_governance", "hybrid_technical", "hybrid_governance"]).toContain(bin);
    }
  });

  it("3.4.3 is hybrid_technical (OS PARTIAL + governance docs to close)", () => {
    expect(getControlBin("3.4.3")).toBe("hybrid_technical");
  });

  it("3.10.1-3.10.5 inherited are pure_technical", () => {
    expect(getControlBin("3.10.1")).toBe("pure_technical");
    expect(getControlBin("3.10.5")).toBe("pure_technical");
  });

  it("isHybridControl is true only for hybrid_technical and hybrid_governance", () => {
    expect(isHybridControl("3.1.22")).toBe(true); // OS partial -> hybrid_technical
    expect(isHybridControl("3.4.3")).toBe(true);  // OS partial -> hybrid_technical
    expect(isHybridControl("3.1.18")).toBe(true);  // delta -> hybrid_governance
    expect(isHybridControl("3.1.4")).toBe(false);  // pure_governance
    expect(isHybridControl("3.10.1")).toBe(false); // pure_technical (inherited)
  });
});
