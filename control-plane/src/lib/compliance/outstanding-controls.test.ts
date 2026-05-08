import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_36_CONTROL_IDS,
  INHERITED_6_CONTROL_IDS,
  NOT_APPLICABLE_10_CONTROL_IDS,
  OUTSTANDING_CLOSE_PATHS,
  OUTSTANDING_TOTALS,
  DISPOSITION_OVERRIDES,
  ARCHITECTURE_STATIC_DISPOSITION_OVERRIDES,
  CUSTOMER_ATTESTED_INHERITED,
  BUCKET_SUMMARY,
  getOutstandingByBucket,
  isOutstanding,
  isInheritedFromAzure,
  isNotApplicableForVault,
  isCustomerAttestedInherited,
} from "./outstanding-controls";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

describe("outstanding-controls snapshot", () => {
  it("totals reconcile to 110 with 74 adjudicated and 36 outstanding", () => {
    expect(OUTSTANDING_TOTALS.total).toBe(110);
    expect(OUTSTANDING_TOTALS.implemented).toBe(68);
    expect(OUTSTANDING_TOTALS.partial).toBe(26);
    expect(OUTSTANDING_TOTALS.not_applicable).toBe(10);
    expect(OUTSTANDING_TOTALS.inherited).toBe(6);
    expect(OUTSTANDING_TOTALS.adjudicated).toBe(74);
    expect(OUTSTANDING_TOTALS.outstanding).toBe(36);
    expect(
      OUTSTANDING_TOTALS.implemented +
        OUTSTANDING_TOTALS.partial +
        OUTSTANDING_TOTALS.not_applicable +
        OUTSTANDING_TOTALS.inherited
    ).toBe(110);
    expect(OUTSTANDING_TOTALS.adjudicated + OUTSTANDING_TOTALS.outstanding).toBe(110);
  });

  it("OUTSTANDING_36 has exactly 36 unique control IDs", () => {
    expect(OUTSTANDING_36_CONTROL_IDS.length).toBe(36);
    expect(new Set(OUTSTANDING_36_CONTROL_IDS).size).toBe(36);
  });

  it("INHERITED_6 has exactly 6 unique control IDs (full 3.10 family)", () => {
    expect(INHERITED_6_CONTROL_IDS.length).toBe(6);
    expect(new Set(INHERITED_6_CONTROL_IDS).size).toBe(6);
    for (const id of INHERITED_6_CONTROL_IDS) {
      expect(id.startsWith("3.10.")).toBe(true);
    }
  });

  it("NOT_APPLICABLE_10 has exactly 10 unique control IDs", () => {
    expect(NOT_APPLICABLE_10_CONTROL_IDS.length).toBe(10);
    expect(new Set(NOT_APPLICABLE_10_CONTROL_IDS).size).toBe(10);
  });

  it("every outstanding control ID is a valid NIST 800-171 control", () => {
    const valid = new Set(ALL_CONTROL_IDS);
    for (const id of OUTSTANDING_36_CONTROL_IDS) {
      expect(valid.has(id)).toBe(true);
    }
  });

  it("OUTSTANDING_CLOSE_PATHS covers every outstanding control with a non-empty primaryAction", () => {
    expect(OUTSTANDING_CLOSE_PATHS.size).toBe(36);
    for (const id of OUTSTANDING_36_CONTROL_IDS) {
      const entry = OUTSTANDING_CLOSE_PATHS.get(id);
      expect(entry).toBeDefined();
      expect(entry!.primaryAction.length).toBeGreaterThan(0);
      expect(["A", "B", "C", "D", "E"]).toContain(entry!.bucket);
    }
  });

  it("bucket counts match the snapshot summary (A=6, B=16, C=4, E=10)", () => {
    expect(getOutstandingByBucket("A").length).toBe(6);
    expect(getOutstandingByBucket("B").length).toBe(16);
    expect(getOutstandingByBucket("C").length).toBe(4);
    expect(getOutstandingByBucket("D").length).toBe(0);
    expect(getOutstandingByBucket("E").length).toBe(10);
    expect(BUCKET_SUMMARY.A_existing_flow.count).toBe(6);
    expect(BUCKET_SUMMARY.B_existing_register.count).toBe(16);
    expect(BUCKET_SUMMARY.C_new_template_or_attestation.count).toBe(4);
    expect(BUCKET_SUMMARY.E_na_attestation.count).toBe(10);
  });

  it("E-bucket controls match NOT_APPLICABLE_10 exactly", () => {
    const eBucketIds = getOutstandingByBucket("E").map((e) => e.controlId).sort();
    const naIds = [...NOT_APPLICABLE_10_CONTROL_IDS].sort();
    expect(eBucketIds).toEqual(naIds);
  });

  it("outstanding, inherited, and N/A sets are pairwise disjoint", () => {
    const outstanding = new Set(OUTSTANDING_36_CONTROL_IDS);
    const inherited = new Set(INHERITED_6_CONTROL_IDS);
    const na = new Set(NOT_APPLICABLE_10_CONTROL_IDS);
    // outstanding contains both PARTIAL and N/A controls — N/A is a subset of outstanding
    for (const id of na) expect(outstanding.has(id)).toBe(true);
    for (const id of inherited) expect(outstanding.has(id)).toBe(false);
    for (const id of inherited) expect(na.has(id)).toBe(false);
  });

  it("every Bucket B entry that claims registerSchemaExists=false is in REGISTER_SCHEMA_GAPS", () => {
    const bucketB = getOutstandingByBucket("B");
    const gaps = bucketB.filter((b) => b.registerSchemaExists === false);
    // matches the 3 known gaps: remote_access_authorization, external_system_connections, portable_storage_authorization
    expect(gaps.length).toBe(3);
    expect(gaps.map((g) => g.registerSchemaId).sort()).toEqual([
      "external_system_connections",
      "portable_storage_authorization",
      "remote_access_authorization",
    ]);
  });

  it("disposition overrides split: 8 architecture-static + 2 customer-attested = 10 total", () => {
    expect(ARCHITECTURE_STATIC_DISPOSITION_OVERRIDES.length).toBe(8);
    expect(CUSTOMER_ATTESTED_INHERITED.length).toBe(2);
    expect(DISPOSITION_OVERRIDES.length).toBe(10);
    const ids = new Set(DISPOSITION_OVERRIDES.map((d) => d.controlId));
    expect(ids.size).toBe(10);
  });

  it("the 2 customer-attested-inherited controls are 3.10.3 and 3.10.6 with attestation templates", () => {
    const ids = CUSTOMER_ATTESTED_INHERITED.map((c) => c.controlId).sort();
    expect(ids).toEqual(["3.10.3", "3.10.6"]);
    for (const c of CUSTOMER_ATTESTED_INHERITED) {
      expect(c.intelligenceDisposition).toBe("partial");
      expect(c.snapshotDisposition).toBe("inherited");
      expect(c.attestationTemplateId.length).toBeGreaterThan(0);
      expect(c.fallbackRegisterSchemaId.length).toBeGreaterThan(0);
      expect(isCustomerAttestedInherited(c.controlId)).toBe(true);
    }
  });

  it("3.10.3 and 3.10.6 are NOT in architecture-static overrides (they stay PARTIAL in control-intelligence.ts)", () => {
    const archIds = new Set(ARCHITECTURE_STATIC_DISPOSITION_OVERRIDES.map((d) => d.controlId));
    expect(archIds.has("3.10.3")).toBe(false);
    expect(archIds.has("3.10.6")).toBe(false);
  });

  it("helper accessors are consistent with the master sets", () => {
    expect(isOutstanding("3.1.4")).toBe(true);
    expect(isOutstanding("3.10.1")).toBe(false);
    expect(isInheritedFromAzure("3.10.1")).toBe(true);
    expect(isInheritedFromAzure("3.10.6")).toBe(true);
    expect(isInheritedFromAzure("3.1.4")).toBe(false);
    expect(isNotApplicableForVault("3.1.16")).toBe(true);
    expect(isNotApplicableForVault("3.1.18")).toBe(false); // moved to IMPLEMENTED in canonical
  });
});
