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
import { ENCLAVE_OS_PARTIAL_31_NIST_IDS } from "./os-evidence-manifest";

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

  it("returns correct counts: 17 pure gov, 52 pure technical, 31 hybrid technical, 10 hybrid governance", () => {
    // Reconciled 2026-05-01c: control-bins now includes CUSTOMER_ATTESTED_INHERITED
    // in CLOUD_12 (3.10.3, 3.10.6) — same as satisfaction-sources, so the
    // two surfaces never disagree. Plus validator v1.5 added 3.1.18, 3.1.19,
    // 3.8.9 to CLOUD. Net shifts: +5 pure_technical (3.10.3, 3.10.6, 3.1.18,
    // 3.1.19, 3.8.9 all now in CLOUD), -5 hybrid_governance.
    const { counts } = validateControlBins();
    expect(counts.pure_governance).toBe(17);
    expect(counts.pure_technical).toBe(52);
    expect(counts.hybrid_technical).toBe(31);
    expect(counts.hybrid_governance).toBe(10);
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

  it("3.10.1, 3.10.2, 3.10.4, 3.10.5 strict-inherited are pure_technical", () => {
    expect(getControlBin("3.10.1")).toBe("pure_technical");
    expect(getControlBin("3.10.2")).toBe("pure_technical");
    expect(getControlBin("3.10.4")).toBe("pure_technical");
    expect(getControlBin("3.10.5")).toBe("pure_technical");
  });

  it("3.10.3 and 3.10.6 are pure_technical via customer-attested CLOUD inheritance", () => {
    // Reconciled 2026-05-01c: CUSTOMER_ATTESTED_INHERITED (3.10.3, 3.10.6)
    // is now part of CLOUD_12 in control-bins (matching satisfaction-sources).
    // They're pure_technical because cloud is the satisfaction lane — the
    // customer attestation is what flips the disposition to inherited.
    expect(getControlBin("3.10.3")).toBe("pure_technical");
    expect(getControlBin("3.10.6")).toBe("pure_technical");
  });

  it("isHybridControl is true only for hybrid_technical and hybrid_governance", () => {
    expect(isHybridControl("3.1.22")).toBe(true); // OS partial -> hybrid_technical
    expect(isHybridControl("3.4.3")).toBe(true);  // OS partial -> hybrid_technical
    // 3.1.18 was delta-hybrid before validator v1.5; now it's pure_technical
    // (cloud-validated by AZ-MOBILE-DEVICE-CONTROL). Switched the test target
    // to 3.10.6 — still delta-hybrid (customer-attested-inherited via the
    // wizard's attest_no_alternate_work_sites flow).
    expect(isHybridControl("3.10.6")).toBe(false); // now pure_technical via CLOUD_12 (customer-attested cloud)
    expect(isHybridControl("3.1.4")).toBe(false);  // pure_governance
    expect(isHybridControl("3.10.1")).toBe(false); // pure_technical (inherited)
  });

  it("sanity: every OS manifest PARTIAL (31) is hybrid_technical unless in PURE_GOV", () => {
    expect(ENCLAVE_OS_PARTIAL_31_NIST_IDS.length).toBe(31);
    const pureGovSet = new Set(PURE_GOVERNANCE_IDS);
    const hybridTechSet = new Set(HYBRID_TECHNICAL_IDS);
    for (const id of ENCLAVE_OS_PARTIAL_31_NIST_IDS) {
      if (pureGovSet.has(id)) continue; // 3.4.3 was moved out of PURE_GOV so none now
      expect(hybridTechSet.has(id)).toBe(true);
    }
  });

  it("sanity: 3.5.5 is pure_technical (OS STRONG in manifest, not PARTIAL)", () => {
    expect(getControlBin("3.5.5")).toBe("pure_technical");
    expect(HYBRID_TECHNICAL_IDS).not.toContain("3.5.5");
  });

  it("sanity: all 110 controls get exactly one bin and sum to 110", () => {
    const { ok, total, counts, errors } = validateControlBins();
    expect(errors).toHaveLength(0);
    expect(ok).toBe(true);
    expect(total).toBe(110);
    const sum =
      counts.pure_governance +
      counts.pure_technical +
      counts.hybrid_technical +
      counts.hybrid_governance;
    expect(sum).toBe(110);
  });
});
