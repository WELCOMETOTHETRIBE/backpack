import { describe, it, expect } from "vitest";
import {
  getSatisfactionSources,
  runC3PAOValidation,
  OS_73_CONTROL_IDS,
  CLOUD_12_CONTROL_IDS,
  NA_7_CONTROL_IDS,
  GOVERNANCE_18_CONTROL_IDS,
  OS_PARTIAL_31_CONTROL_IDS,
} from "./satisfaction-sources";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

describe("satisfaction-sources", () => {
  describe("getSatisfactionSources", () => {
    it("returns oftenNotApplicable and real bin for the 7 N/A-listed controls", () => {
      const s116 = getSatisfactionSources("3.1.16");
      expect(s116.oftenNotApplicable).toBe(true);
      expect(s116.hybrid).toBe(true); // delta (not in 73/12/18)
      const s314 = getSatisfactionSources("3.13.14");
      expect(s314.oftenNotApplicable).toBe(true);
      expect(s314.hybrid).toBe(true);
    });

    it("returns os for enclave (73) controls", () => {
      expect(getSatisfactionSources("3.1.1").os).toBe(true);
      expect(getSatisfactionSources("3.14.7").os).toBe(true);
    });

    it("returns cloud for inherited (3.10.1–3.10.5) and Azure/Entra (7)", () => {
      expect(getSatisfactionSources("3.10.1").cloud).toBe(true);
      expect(getSatisfactionSources("3.10.5").cloud).toBe(true);
      expect(getSatisfactionSources("3.3.1").cloud).toBe(true);
      expect(getSatisfactionSources("3.1.14").cloud).toBe(true);
    });

    it("returns both os and cloud for controls in 73 and Azure/Entra (3.1.13, 3.13.8)", () => {
      const s1313 = getSatisfactionSources("3.1.13");
      expect(s1313.os).toBe(true);
      expect(s1313.cloud).toBe(true);
      const s138 = getSatisfactionSources("3.13.8");
      expect(s138.os).toBe(true);
      expect(s138.cloud).toBe(true);
    });

    it("returns governance for 17 PURE_GOV controls", () => {
      expect(getSatisfactionSources("3.1.4").governance).toBe(true);
      expect(getSatisfactionSources("3.2.1").governance).toBe(true);
    });

    it("returns hybrid for OS partial (31) and delta (6)", () => {
      expect(getSatisfactionSources("3.4.3").hybrid).toBe(true);
      expect(getSatisfactionSources("3.4.3").os).toBe(true);
      expect(getSatisfactionSources("3.1.18").hybrid).toBe(true);
      expect(getSatisfactionSources("3.1.18").os).toBe(false);
    });
  });

  describe("C3PAO validation", () => {
    it("runs validation against all CMMC L2 controls and passes", () => {
      const result = runC3PAOValidation(ALL_CONTROL_IDS);

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalControls).toBe(110);
      expect(result.expectedTotal).toBe(110);

      expect(result.tally.os).toBe(73);
      expect(result.tally.cloud).toBe(12);
      expect(result.tally.oftenNotApplicable).toBe(7);
      expect(result.tally.governance).toBe(17);
      expect(result.tally.hybrid).toBe(45); // 31 OS partial + delta (3.4.3 was already hybrid by os+osPartial)
      expect(result.tally.osAndCloud).toBe(6);

      expect(result.unassigned).toHaveLength(0);
      expect(result.osCloudOverlap).toHaveLength(6);
      expect(result.osCloudOverlap).toContain("3.1.13");
      expect(result.osCloudOverlap).toContain("3.13.8");
    });

    it("set sizes match C3PAO expectations", () => {
      expect(OS_73_CONTROL_IDS.size).toBe(73);
      expect(CLOUD_12_CONTROL_IDS.size).toBe(12);
      expect(NA_7_CONTROL_IDS.size).toBe(7);
      expect(GOVERNANCE_18_CONTROL_IDS.size).toBe(17);
      expect(OS_PARTIAL_31_CONTROL_IDS.size).toBe(31);
    });

    it("N/A set is disjoint from OS and Cloud", () => {
      for (const id of NA_7_CONTROL_IDS) {
        expect(OS_73_CONTROL_IDS.has(id)).toBe(false);
        expect(CLOUD_12_CONTROL_IDS.has(id)).toBe(false);
      }
    });

    it("every control has at least one satisfaction source (os, cloud, governance, or hybrid)", () => {
      const result = runC3PAOValidation(ALL_CONTROL_IDS);
      expect(result.ok).toBe(true);
      expect(result.unassigned).toHaveLength(0);
    });
  });
});
