import { describe, it, expect } from "vitest";
import { GOVERNANCE_DOCUMENT_MATRIX } from "@/lib/governance/governance-document-matrix";
import {
  CLIENT_REQUIRED_ARTIFACTS,
  MILESTONES_BY_KEY,
  POAM_ELIGIBLE_CONTROLS,
} from "@/data/cmmc/client-required-artifacts";

// Hermetic: validates the *catalog inputs* the readiness checklist
// depends on. Actual end-to-end coverage (with a seeded DB) is a follow-up.

describe("readiness checklist inputs", () => {
  it("governance matrix yields at least 15 required rows for the checklist", () => {
    const required = GOVERNANCE_DOCUMENT_MATRIX.filter(
      (d) => d.govPure || d.govHybrid || d.techHybrid
    );
    expect(required.length).toBeGreaterThanOrEqual(15);
    // Every required row should have at least one control mapped
    for (const row of required) {
      expect(row.controlsMapped.length).toBeGreaterThan(0);
    }
  });

  it("catalog milestones split sensibly across closureType buckets", () => {
    let uploads = 0;
    let attestations = 0;
    let registerPointers = 0;
    let systemPointers = 0;
    for (const c of POAM_ELIGIBLE_CONTROLS) {
      for (const m of c.milestones) {
        if (m.closureType === "upload") uploads++;
        else if (m.closureType === "attestation") attestations++;
        else if (m.closureType === "register_pointer") registerPointers++;
        else if (m.closureType === "system_pointer") systemPointers++;
      }
    }
    // The "Required Artifacts" and "Attestations" sections derive from these.
    expect(uploads).toBeGreaterThanOrEqual(20);
    expect(attestations).toBeGreaterThanOrEqual(5);
    // register_pointer milestones are rendered via the Registers section; ensure
    // there ARE some so that section stays meaningful.
    expect(registerPointers).toBeGreaterThan(0);
    // system_pointer should be rare (SSP etc.)
    expect(systemPointers).toBeLessThan(5);
  });

  it("milestone keys that the UI parses for controlId all match the prefix pattern", () => {
    const pattern = /^[A-Z]{2}\.\d+\.\d+\.\d+\./;
    for (const entry of CLIENT_REQUIRED_ARTIFACTS) {
      for (const m of entry.milestones) {
        expect(m.key, `milestone "${m.key}" does not match expected prefix pattern`).toMatch(
          pattern
        );
      }
    }
  });

  it("MILESTONES_BY_KEY covers every catalog milestone", () => {
    for (const entry of CLIENT_REQUIRED_ARTIFACTS) {
      for (const m of entry.milestones) {
        expect(MILESTONES_BY_KEY.get(m.key)).toBeDefined();
      }
    }
  });
});
