import { describe, it, expect } from "vitest";
import { computeControlRows, buildRegisterHealthReason, type RegisterStats } from "./control-dashboard";
import { getEvidenceMap } from "@/data/cmmc";

function mockRegisterStats(overrides: Partial<RegisterStats> & { registerKey: string }): RegisterStats {
  return {
    registerKey: overrides.registerKey,
    hasFinalInCadence: false,
    lastFinalizedAt: null,
    nextDueAt: null,
    registerHealth: "overdue",
    cadenceDays: 90,
    hasAnyEntry: false,
    lastEntryAt: null,
    lastEntryStatus: "none",
    lastEvidenceType: "none",
    registerHealthReason: "",
    ...overrides,
  };
}

describe("control-dashboard", () => {
  describe("computeControlRows", () => {
    it("returns one row per control from evidence map", () => {
      const evidenceMap = getEvidenceMap();
      const stats = new Map<string, RegisterStats>();
      const rows = computeControlRows(stats);
      expect(rows.length).toBe(evidenceMap.controls.length);
    });

    it("returns red or na when no register has evidence", () => {
      const stats = new Map<string, RegisterStats>();
      const rows = computeControlRows(stats);
      const statuses = new Set(rows.map((r) => r.coverageStatus));
      expect(statuses.has("green")).toBe(false);
      expect(statuses.has("yellow")).toBe(false);
      expect(statuses.has("red")).toBe(true);
      expect(statuses.has("na")).toBe(true);
    });

    it("returns green when all mapped registers have final in cadence", () => {
      const evidenceMap = getEvidenceMap();
      const controlWithRegisters = evidenceMap.controls.find((c) => (c.registers?.length ?? 0) > 0);
      if (!controlWithRegisters?.registers?.length) return;

      const stats = new Map<string, RegisterStats>();
      const now = new Date();
      for (const rk of controlWithRegisters.registers) {
        stats.set(rk, mockRegisterStats({ registerKey: rk, hasFinalInCadence: true, lastFinalizedAt: now, registerHealth: "healthy" }));
      }
      const rows = computeControlRows(stats);
      const row = rows.find((r) => r.controlId === controlWithRegisters.control_id);
      expect(row).toBeDefined();
      expect(row?.coverageStatus).toBe("green");
      expect(row?.lastEvidenceDate).not.toBeNull();
    });

    it("returns yellow when some but not all registers have evidence", () => {
      const evidenceMap = getEvidenceMap();
      const controlWithTwo = evidenceMap.controls.find((c) => (c.registers?.length ?? 0) >= 2);
      if (!controlWithTwo?.registers?.length) return;

      const stats = new Map<string, RegisterStats>();
      const now = new Date();
      stats.set(controlWithTwo.registers[0], mockRegisterStats({ registerKey: controlWithTwo.registers[0], hasFinalInCadence: true, lastFinalizedAt: now, registerHealth: "healthy" }));
      stats.set(controlWithTwo.registers[1], mockRegisterStats({ registerKey: controlWithTwo.registers[1], hasFinalInCadence: false, lastFinalizedAt: null }));
      const rows = computeControlRows(stats);
      const row = rows.find((r) => r.controlId === controlWithTwo.control_id);
      expect(row).toBeDefined();
      expect(row?.coverageStatus).toBe("yellow");
    });
  });

  describe("buildRegisterHealthReason", () => {
    const cadenceDays = 90;
    const warningDays = 14;

    it("event_driven: returns event-driven message", () => {
      const r = buildRegisterHealthReason("event_driven", { lastFinalizedAt: null, nextDueAt: null, cadenceDays, warningDays });
      expect(r).toContain("Event-driven register");
      expect(r).toContain("no fixed due date");
      expect(r).toContain("Requires ≥1 finalized entry");
    });

    it("healthy: returns last finalized and cadence", () => {
      const now = new Date();
      const lastFinalizedAt = new Date(now);
      lastFinalizedAt.setDate(lastFinalizedAt.getDate() - 30);
      const r = buildRegisterHealthReason("healthy", { lastFinalizedAt, nextDueAt: null, cadenceDays, warningDays }, now);
      expect(r).toMatch(/Last finalized entry \d+ days ago/);
      expect(r).toContain("cadence 90 days");
    });

    it("due: returns next due in X days", () => {
      const now = new Date();
      const nextDueAt = new Date(now);
      nextDueAt.setDate(nextDueAt.getDate() + 7);
      const r = buildRegisterHealthReason("due", { lastFinalizedAt: null, nextDueAt, cadenceDays, warningDays }, now);
      expect(r).toMatch(/Next due in \d+ days/);
      expect(r).toContain("cadence 90 days");
      expect(r).toContain("warning 14 days");
    });

    it("overdue with no entry: returns no finalized entry", () => {
      const r = buildRegisterHealthReason("overdue", { lastFinalizedAt: null, nextDueAt: null, cadenceDays, warningDays });
      expect(r).toContain("No finalized entry");
      expect(r).toContain("cadence 90 days");
    });

    it("overdue with past due: returns overdue by X days", () => {
      const now = new Date();
      const lastFinalizedAt = new Date(now);
      lastFinalizedAt.setDate(lastFinalizedAt.getDate() - 120);
      const nextDueAt = new Date(lastFinalizedAt);
      nextDueAt.setDate(nextDueAt.getDate() + cadenceDays);
      const r = buildRegisterHealthReason("overdue", { lastFinalizedAt, nextDueAt, cadenceDays, warningDays }, now);
      expect(r).toMatch(/Overdue by \d+ days/);
      expect(r).toMatch(/last finalized \d+ days ago/);
    });
  });
});
