import { describe, it, expect } from "vitest";
import { computeScoring } from "./scoring";
import type { RegisterStats } from "./control-dashboard";
import { getControlAssessmentLogic } from "@/data/cmmc";

function mockStats(overrides: Partial<RegisterStats> & { registerKey: string }): RegisterStats {
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

describe("scoring", () => {
  it("derives lastEvidenceType from register with latest entry (final wins when latest)", () => {
    const logic = getControlAssessmentLogic();
    const controlWithRegisters = logic.controls.find((c) => (c.register_requirements?.length ?? 0) >= 2);
    if (!controlWithRegisters?.register_requirements?.length) return;

    const reqs = controlWithRegisters.register_requirements!;
    const r1 = reqs[0].register_id;
    const r2 = reqs[1].register_id;
    const older = new Date("2025-01-01");
    const newer = new Date("2025-02-01");

    const stats = new Map<string, RegisterStats>();
    stats.set(r1, mockStats({ registerKey: r1, lastEntryAt: older, lastEntryStatus: "final", lastEvidenceType: "final" }));
    stats.set(r2, mockStats({ registerKey: r2, lastEntryAt: newer, lastEntryStatus: "draft", lastEvidenceType: "draft" }));

    const result = computeScoring(stats);
    const row = result.controls.find((c) => c.controlId === controlWithRegisters.control_id);
    expect(row).toBeDefined();
    expect(row?.lastEvidenceType).toBe("draft");
  });

  it("derives lastEvidenceType none when no entries", () => {
    const logic = getControlAssessmentLogic();
    const controlWithRegisters = logic.controls.find((c) => (c.register_requirements?.length ?? 0) >= 1);
    if (!controlWithRegisters?.register_requirements?.length) return;

    const stats = new Map<string, RegisterStats>();
    for (const req of controlWithRegisters.register_requirements!) {
      stats.set(req.register_id, mockStats({ registerKey: req.register_id }));
    }

    const result = computeScoring(stats);
    const row = result.controls.find((c) => c.controlId === controlWithRegisters.control_id);
    expect(row).toBeDefined();
    expect(row?.lastEvidenceType).toBe("none");
  });
});
