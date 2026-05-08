import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTechnicalResultForControl,
  getCombinedTechnicalStatus,
  getLatestTechnicalRunForBoundary,
} from "./technical-runs";

const boundaryId = "boundary-1";
const controlId = "AC.L2-3.1.3";

const dbState = vi.hoisted(() => ({ fromCallCount: 0, emptyEntries: false }));

const mockRunRow = {
  id: "entry-1",
  registerId: "reg-1",
  boundaryId: "boundary-1",
  entryType: "collector_run",
  status: "final",
  entryData: {
    run_id: "20260305T074916Z-a00d8782",
    overall_status: "pass",
    pass: 10,
    fail: 0,
    warn: 0,
    error: 0,
    na: 0,
    checks_total: 10,
    collector_version: "2.0.0",
    vault_outputs_root: "/vault/runs/run-1",
    control_results: {
      "AC.L2-3.1.3": { status: "pass", title: "Network access controlled", source: "windows" },
      "IA.L2-3.5.3": { status: "fail", title: "MFA enforced", remediation: "Enable MFA" },
    },
  },
  createdById: null,
  finalizedAt: new Date(),
  finalizedById: null,
  hold: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation(() => {
      dbState.fromCallCount += 1;
      const count = dbState.fromCallCount % 3;
      if (count === 1) {
        return { where: vi.fn().mockResolvedValue([{ organizationId: "org-1" }]) };
      }
      if (count === 2) {
        return { where: vi.fn().mockResolvedValue([{ id: "reg-1" }]) };
      }
      return {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() =>
          Promise.resolve(dbState.emptyEntries ? [] : [mockRunRow])
        ),
      };
    }),
  },
}));

describe("technical-runs", () => {
  beforeEach(() => {
    dbState.fromCallCount = 0;
  });

  describe("getLatestTechnicalRunForBoundary", () => {
    it("returns run with control_results when boundary has an entry", async () => {
      const run = await getLatestTechnicalRunForBoundary(boundaryId);
      expect(run).not.toBeNull();
      expect(run!.runId).toBe("20260305T074916Z-a00d8782");
      expect(run!.controlResults["AC.L2-3.1.3"]).toEqual({ status: "pass", title: "Network access controlled", source: "windows" });
    });
  });

  describe("getTechnicalResultForControl", () => {
    it("returns result when control exists in control_results", async () => {
      const result = await getTechnicalResultForControl(boundaryId, "AC.L2-3.1.3");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("pass");
      expect(result!.title).toBe("Network access controlled");
    });

    it("returns result for another control in run", async () => {
      const result = await getTechnicalResultForControl(boundaryId, "IA.L2-3.5.3");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("fail");
      expect(result!.remediation).toBe("Enable MFA");
    });

    it("returns null when control not in control_results", async () => {
      const result = await getTechnicalResultForControl(boundaryId, "SC.L2-1.1.1");
      expect(result).toBeNull();
    });
  });

  describe("getCombinedTechnicalStatus", () => {
    it("returns azure_inherited with note when responsibility is azure_inherited and no technical result", async () => {
      const status = await getCombinedTechnicalStatus(boundaryId, "SC.L2-1.1.1", "azure_inherited");
      expect(status.kind).toBe("azure_inherited");
      expect(status.note).toContain("Azure inherited");
      expect(status.note).toContain("no technical check in scope");
    });

    it("returns result when control has technical result", async () => {
      const status = await getCombinedTechnicalStatus(boundaryId, controlId, "customer_managed");
      expect(status.kind).toBe("result");
      if (status.kind === "result") {
        expect(status.status).toBe("pass");
        expect(status.runId).toBe("20260305T074916Z-a00d8782");
        expect(status.result?.title).toBe("Network access controlled");
      }
    });

    it("returns no_run when no run for boundary", async () => {
      dbState.emptyEntries = true;
      dbState.fromCallCount = 0;
      const status = await getCombinedTechnicalStatus(boundaryId, controlId, null);
      expect(status.kind).toBe("no_run");
      expect(status.note).toContain("No technical compliance run");
      dbState.emptyEntries = false;
    });
  });
});
