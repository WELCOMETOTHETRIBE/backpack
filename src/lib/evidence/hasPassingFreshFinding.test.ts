import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasPassingFreshEnclaveFinding } from "./hasPassingFreshFinding";

function fiveDaysAgo(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 5);
  return d;
}

function twoHundredDaysAgo(now: Date): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 200);
  return d;
}

describe("hasPassingFreshEnclaveFinding", () => {
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();
  const mockInnerJoin = vi.fn();
  const mockFrom = vi.fn();
  const mockSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderBy.mockReturnValue(undefined);
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns ok true when passing finding is fresh (windows_server_hardening, layer 90d)", async () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const collectedAt = fiveDaysAgo(now);
    mockOrderBy.mockResolvedValue([
      {
        runId: "run-1",
        collectedAt,
        source: "windows_server_hardening",
        runFingerprint: "fp-abc",
        findingControlId: "AC.L2-3.1.22",
        pass: true,
      },
    ]);

    const db = { select: mockSelect } as unknown as typeof import("@/db").db;
    const result = await hasPassingFreshEnclaveFinding({
      db,
      organizationId: "org-1",
      controlNistId: "3.1.22",
      layer: "GuestOS/Hardening",
      nowUtc: now.toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(result.runCollectedAt).toBeDefined();
    expect(result.source).toBe("windows_server_hardening");
    expect(result.runFingerprint).toBe("fp-abc");
    expect(result.freshness_status).toBe("fresh");
    expect(result.reason).toBeUndefined();
  });

  it("returns ok false with reason stale_evidence when finding is past freshness window", async () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const collectedAt = twoHundredDaysAgo(now);
    mockOrderBy.mockResolvedValue([
      {
        runId: "run-1",
        collectedAt,
        source: "windows_server_hardening",
        runFingerprint: "fp-old",
        findingControlId: "AC.L2-3.1.22",
        pass: true,
      },
    ]);

    const db = { select: mockSelect } as unknown as typeof import("@/db").db;
    const result = await hasPassingFreshEnclaveFinding({
      db,
      organizationId: "org-1",
      controlNistId: "3.1.22",
      layer: "GuestOS/Hardening",
      nowUtc: now.toISOString(),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stale_evidence");
    expect(result.freshness_status).toBe("stale");
    expect(result.runCollectedAt).toBeDefined();
  });

  it("returns ok false with reason no_finding when no matching run (e.g. wrong source not in query)", async () => {
    mockOrderBy.mockResolvedValue([]);

    const db = { select: mockSelect } as unknown as typeof import("@/db").db;
    const result = await hasPassingFreshEnclaveFinding({
      db,
      organizationId: "org-1",
      controlNistId: "3.1.22",
      layer: "GuestOS/Hardening",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_finding");
  });

  it("returns ok false with reason unknown_layer_freshness when layer is null (STRICT: no credit)", async () => {
    const now = new Date();
    const collectedAt = fiveDaysAgo(now);
    mockOrderBy.mockResolvedValue([
      {
        runId: "run-1",
        collectedAt,
        source: "windows_server_hardening",
        runFingerprint: "fp-xyz",
        findingControlId: "AC.L2-3.1.22",
        pass: true,
      },
    ]);

    const db = { select: mockSelect } as unknown as typeof import("@/db").db;
    const result = await hasPassingFreshEnclaveFinding({
      db,
      organizationId: "org-1",
      controlNistId: "3.1.22",
      layer: null,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unknown_layer_freshness");
    expect(result.runCollectedAt).toBeDefined();
    expect(result.source).toBe("windows_server_hardening");
    expect(result.runFingerprint).toBe("fp-xyz");
    expect(result.freshness_status).toBe("unknown");
  });
});
