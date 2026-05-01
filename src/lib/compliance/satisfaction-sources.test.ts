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

    it("returns hybrid for OS partial (31) and any remaining delta", () => {
      expect(getSatisfactionSources("3.4.3").hybrid).toBe(true);
      expect(getSatisfactionSources("3.4.3").os).toBe(true);
      // 3.1.18 was delta-hybrid before validator v1.5 (claimed implemented
      // without proof). Now it's cloud-validated — no longer hybrid. Switching
      // the assertion to confirm the post-v1.5 state instead.
      expect(getSatisfactionSources("3.1.18").hybrid).toBe(false);
      expect(getSatisfactionSources("3.1.18").cloud).toBe(true);
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
      // CLOUD = 4 strict-inherited (3.10.1, .2, .4, .5) + 2 customer-attested
      // (3.10.3, 3.10.6) + 12 Azure/Entra validated = 18 distinct controls.
      // Previously 17 (3.10.3 was double-counted in strict-inherited AND in
      // CUSTOMER_ATTESTED_INHERITED). Now correctly partitioned —
      // honest C3PAO adjudication.
      // CLOUD = 21: 4 strict + 2 customer-attested + 15 validated (v1.5)
      expect(result.tally.cloud).toBe(21);
      expect(result.tally.oftenNotApplicable).toBe(6);
      expect(result.tally.governance).toBe(17);
      // hybrid = 41 (was 44). Validator v1.5 added 3.1.18, 3.1.19, 3.8.9
      // to CLOUD; they were previously delta-hybrid (Bin 8 — claimed
      // implemented without proof). Now properly cloud-validated.
      expect(result.tally.hybrid).toBe(41);
      // OS+Cloud overlap stayed at 11 (3.10.3/.6 are NOT in OS_73 so they
      // don't contribute even though they're now Cloud).
      expect(result.tally.osAndCloud).toBe(11);

      expect(result.unassigned).toHaveLength(0);
      expect(result.osCloudOverlap).toHaveLength(11);
      expect(result.osCloudOverlap).toContain("3.1.13");
      expect(result.osCloudOverlap).toContain("3.13.8");
      expect(result.osCloudOverlap).toContain("3.13.10");
      expect(result.osCloudOverlap).toContain("3.5.5");
    });

    it("set sizes match C3PAO expectations (post 2026-05-01c reconciliation)", () => {
      expect(OS_73_CONTROL_IDS.size).toBe(73);
      // CLOUD set: 4 strict + 2 customer-attested + 15 validated (v1.5) = 21
      expect(CLOUD_12_CONTROL_IDS.size).toBe(21);
      // NA_7_CONTROL_IDS now 6 — 3.10.6 removed (handled by attestation flow)
      expect(NA_7_CONTROL_IDS.size).toBe(6);
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
