import { describe, it, expect } from "vitest";
import {
  CLIENT_REQUIRED_ARTIFACTS,
  CLIENT_ARTIFACTS_BY_CONTROL_ID,
  POAM_ELIGIBLE_CONTROLS,
} from "./client-required-artifacts";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

describe("client-required-artifacts catalog", () => {
  it("covers all 110 NIST 800-171 Rev 2 controls", () => {
    expect(CLIENT_REQUIRED_ARTIFACTS.length).toBe(110);
    const ids = CLIENT_REQUIRED_ARTIFACTS.map((c) => c.controlId);
    for (const cid of ALL_CONTROL_IDS) {
      expect(ids).toContain(cid);
    }
  });

  it("has no duplicate controlIds", () => {
    const ids = CLIENT_REQUIRED_ARTIFACTS.map((c) => c.controlId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("represents every family", () => {
    const families = new Set(CLIENT_REQUIRED_ARTIFACTS.map((c) => c.family));
    expect(families).toEqual(
      new Set([
        "AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP",
        "PS", "PE", "RA", "CA", "SC", "SI",
      ])
    );
  });

  it("generates a POAM-eligible subset that still covers the core client-artifact families", () => {
    expect(POAM_ELIGIBLE_CONTROLS.length).toBeGreaterThan(0);
    expect(POAM_ELIGIBLE_CONTROLS.length).toBeLessThanOrEqual(110);
    const eligibleFamilies = new Set(POAM_ELIGIBLE_CONTROLS.map((c) => c.family));
    // Families that unambiguously carry client deliverables from the brief:
    for (const f of ["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PS", "PE", "RA", "CA", "SC", "SI"]) {
      expect(eligibleFamilies).toContain(f);
    }
  });

  it("every eligible entry has a non-empty weaknessSummary and at least one milestone", () => {
    for (const entry of POAM_ELIGIBLE_CONTROLS) {
      expect(entry.weaknessSummary).toMatch(/\S/);
      expect(entry.milestones.length).toBeGreaterThan(0);
    }
  });

  it("every milestone has a stable key, title, description, and valid enum fields", () => {
    const closureTypes = new Set(["upload", "attestation", "register_pointer", "system_pointer"]);
    const cadences = new Set(["one_time", "monthly", "quarterly", "annual", "per_event", "continuous"]);
    for (const entry of POAM_ELIGIBLE_CONTROLS) {
      for (const m of entry.milestones) {
        expect(m.key).toMatch(/^[A-Z]{2}\.\d+\.\d+\.\d+\./);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.description.length).toBeGreaterThan(0);
        expect(closureTypes.has(m.closureType)).toBe(true);
        expect(cadences.has(m.cadence)).toBe(true);
        expect(m.dueOffsetDays).toBeGreaterThan(0);
        if (m.closureType === "register_pointer") {
          expect(m.registerKey).toBeDefined();
        }
      }
    }
  });

  it("milestone keys are globally unique", () => {
    const keys: string[] = [];
    for (const entry of CLIENT_REQUIRED_ARTIFACTS) {
      for (const m of entry.milestones) keys.push(m.key);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("CLIENT_ARTIFACTS_BY_CONTROL_ID round-trips", () => {
    for (const entry of CLIENT_REQUIRED_ARTIFACTS) {
      expect(CLIENT_ARTIFACTS_BY_CONTROL_ID.get(entry.controlId)).toBe(entry);
    }
  });
});
