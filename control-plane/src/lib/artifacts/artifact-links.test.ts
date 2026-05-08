import { describe, it, expect } from "vitest";
import { MILESTONES_BY_KEY, POAM_ELIGIBLE_CONTROLS } from "@/data/cmmc/client-required-artifacts";

// These tests are hermetic and do not touch a database — they validate the
// catalog data that drives closure-type enforcement and placeholder seeding.

describe("client-required-artifacts catalog closure data", () => {
  it("every register_pointer milestone has a registerKey", () => {
    for (const c of POAM_ELIGIBLE_CONTROLS) {
      for (const m of c.milestones) {
        if (m.closureType === "register_pointer") {
          expect(m.registerKey, `missing registerKey on ${m.key}`).toBeTruthy();
        }
      }
    }
  });

  it("MILESTONES_BY_KEY resolves every milestone", () => {
    for (const c of POAM_ELIGIBLE_CONTROLS) {
      for (const m of c.milestones) {
        const resolved = MILESTONES_BY_KEY.get(m.key);
        expect(resolved).toBeDefined();
        expect(resolved!.closureType).toBe(m.closureType);
      }
    }
  });

  it("every upload milestone has a sensible dueOffsetDays (7..365)", () => {
    for (const c of POAM_ELIGIBLE_CONTROLS) {
      for (const m of c.milestones) {
        expect(m.dueOffsetDays).toBeGreaterThanOrEqual(7);
        expect(m.dueOffsetDays).toBeLessThanOrEqual(365);
      }
    }
  });

  it("each catalog milestone belongs to exactly one control entry", () => {
    const parentForKey = new Map<string, string>();
    for (const c of POAM_ELIGIBLE_CONTROLS) {
      for (const m of c.milestones) {
        expect(parentForKey.has(m.key)).toBe(false);
        parentForKey.set(m.key, c.controlId);
      }
    }
  });
});
