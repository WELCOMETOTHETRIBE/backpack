import { describe, it, expect } from "vitest";
import {
  NEEDS_BOTH_PIPELINES_CONTROL_IDS,
  needsBothPipelines,
  isControlAdjudicated,
  type AdjudicationContext,
  type ControlRecordRow,
} from "./adjudication-helpers";
import { ENCLAVE_73_NIST_IDS } from "./compliance/os-evidence-manifest";
import { AZURE_ENTRA_15_CONTROL_IDS } from "./compliance/azure-entra-controls";

const EXPECTED_DUAL_PIPELINE_IDS = [
  "3.1.13",
  "3.3.1",
  "3.3.2",
  "3.5.3",
  "3.5.4",
  "3.5.5",
  "3.5.6",
  "3.7.5",
  "3.13.5",
  "3.13.8",
  "3.13.10",
];

function emptyCtx(): AdjudicationContext {
  return {
    registerFinalCounts: new Map(),
    provisionedRegisterKeys: new Set(),
    artifactBackedRecordIds: new Set(),
    attestationBackedRecordIds: new Set(),
    cloudPipelineSatisfiedNistIds: new Set(),
    intelMap: new Map(),
  };
}

function osStrongImplemented(controlId: string): ControlRecordRow {
  return {
    id: `record-${controlId}`,
    controlId,
    implementationStatus: "implemented",
    technicalStatus: "satisfied", // OS pipeline says PASS
    policyDocRequired: false,
    policyStatus: "not_required",
  };
}

describe("needsBothPipelines", () => {
  it("identifies exactly the 11 OS+Azure dual-pipeline controls", () => {
    expect(NEEDS_BOTH_PIPELINES_CONTROL_IDS.size).toBe(11);
    for (const id of EXPECTED_DUAL_PIPELINE_IDS) {
      expect(needsBothPipelines(id)).toBe(true);
    }
  });

  it("is the intersection of OS_73 and AZURE_15 (auto-derived, not hardcoded)", () => {
    const osSet = new Set(ENCLAVE_73_NIST_IDS);
    const expected = AZURE_ENTRA_15_CONTROL_IDS.filter((id) => osSet.has(id));
    expect([...NEEDS_BOTH_PIPELINES_CONTROL_IDS].sort()).toEqual(expected.sort());
  });

  it("returns false for OS-only controls", () => {
    // 3.1.1 is OS-strong, not in the Azure validator set
    expect(needsBothPipelines("3.1.1")).toBe(false);
    expect(needsBothPipelines("3.4.1")).toBe(false);
  });

  it("returns false for Azure-only controls", () => {
    // 3.1.14 is in AZURE_15 but not in OS_73
    expect(needsBothPipelines("3.1.14")).toBe(false);
    expect(needsBothPipelines("3.1.18")).toBe(false);
    expect(needsBothPipelines("3.1.19")).toBe(false);
    expect(needsBothPipelines("3.8.9")).toBe(false);
  });

  it("returns false for inherited controls (3.10 family)", () => {
    expect(needsBothPipelines("3.10.1")).toBe(false);
    expect(needsBothPipelines("3.10.3")).toBe(false);
  });
});

describe("isControlAdjudicated — dual-pipeline gate", () => {
  it("3.13.5 (NSG) with OS evidence ONLY stays PARTIAL — needs cloud", () => {
    const r = osStrongImplemented("3.13.5");
    const ctx = emptyCtx();
    // OS lane satisfied via technicalStatus, but no cloud finding
    expect(isControlAdjudicated(r, ctx)).toBe(false);
  });

  it("3.13.5 (NSG) with BOTH OS and cloud evidence flips to ADJUDICATED", () => {
    const r = osStrongImplemented("3.13.5");
    const ctx = emptyCtx();
    ctx.cloudPipelineSatisfiedNistIds.add("3.13.5");
    expect(isControlAdjudicated(r, ctx)).toBe(true);
  });

  it("All 11 dual-pipeline controls behave the same way", () => {
    for (const id of EXPECTED_DUAL_PIPELINE_IDS) {
      const r = osStrongImplemented(id);
      const ctx = emptyCtx();
      expect(isControlAdjudicated(r, ctx)).toBe(false); // OS only → PARTIAL
      ctx.cloudPipelineSatisfiedNistIds.add(id);
      expect(isControlAdjudicated(r, ctx)).toBe(true); // both → ADJUDICATED
    }
  });

  it("OS-only control (3.1.1) adjudicates on OS evidence alone", () => {
    const r = osStrongImplemented("3.1.1");
    const ctx = emptyCtx();
    // 3.1.1 isn't dual-pipeline, so OS evidence alone is enough
    expect(isControlAdjudicated(r, ctx)).toBe(true);
  });

  it("inherited controls bypass the dual-pipeline check", () => {
    const r: ControlRecordRow = {
      id: "rec-3.10.1",
      controlId: "3.10.1",
      implementationStatus: "inherited",
      technicalStatus: "not_started",
      policyDocRequired: false,
      policyStatus: "not_required",
    };
    expect(isControlAdjudicated(r, emptyCtx())).toBe(true);
  });

  it("not_applicable controls bypass the dual-pipeline check", () => {
    const r: ControlRecordRow = {
      id: "rec-3.1.16",
      controlId: "3.1.16",
      implementationStatus: "not_applicable",
      technicalStatus: "not_required",
      policyDocRequired: false,
      policyStatus: "not_required",
    };
    expect(isControlAdjudicated(r, emptyCtx())).toBe(true);
  });
});
