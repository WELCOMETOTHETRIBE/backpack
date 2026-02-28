import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifySnapshotCoverage } from "./verifySnapshotCoverage";

const mockComputeEnclaveCoverage = vi.fn();
const mockComputeCoverageHash = vi.fn();
vi.mock("./enclaveCoverage", () => ({
  computeEnclaveCoverage: (...args: unknown[]) => mockComputeEnclaveCoverage(...args),
}));
vi.mock("./coverageHash", () => ({
  computeCoverageHash: (s: unknown) => mockComputeCoverageHash(s),
}));

describe("verifySnapshotCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_snapshot when no snapshot row", async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      and: vi.fn((...args: unknown[]) => ({ and: args })),
    };
    const result = await verifySnapshotCoverage({
      db: db as any,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_snapshot");
  });

  it("returns no_coverage_attached when snapshot has no coverageHash", async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn((...args: unknown[]) => ({ and: args })),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          snapshotId: "snap-1",
          coverageHash: null,
          coverageEvidenceRunId: null,
          coverageRunFingerprint: null,
          coverageCollectedAt: null,
          coverageSource: null,
          coverageTotals: null,
        },
      ]),
    };
    const result = await verifySnapshotCoverage({
      db: db as any,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_coverage_attached");
    expect(mockComputeEnclaveCoverage).not.toHaveBeenCalled();
  });

  it("returns verified when stored hash matches computed hash", async () => {
    const storedHash = "abc123";
    mockComputeEnclaveCoverage.mockResolvedValue({
      totals: { pass_fresh: 1 },
      rows: [],
    });
    mockComputeCoverageHash.mockReturnValue(storedHash);

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn((...args: unknown[]) => ({ and: args })),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            snapshotId: "snap-1",
            coverageHash: storedHash,
            coverageEvidenceRunId: "run-1",
            coverageRunFingerprint: "fp-1",
            coverageCollectedAt: new Date("2025-01-01"),
            coverageSource: "windows_server_hardening",
            coverageTotals: { pass_fresh: 1 },
          },
        ])
        .mockResolvedValueOnce([{ id: "run-1", runFingerprint: "fp-1", collectedAt: new Date("2025-01-01") }]),
    };
    const result = await verifySnapshotCoverage({
      db: db as any,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("verified");
    expect(result.stored?.coverageHash).toBe(storedHash);
    expect(result.computed?.coverageHash).toBe(storedHash);
  });

  it("returns no_run_found when run does not exist", async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn((...args: unknown[]) => ({ and: args })),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            snapshotId: "snap-1",
            coverageHash: "h1",
            coverageEvidenceRunId: "run-missing",
            coverageRunFingerprint: "fp-1",
            coverageCollectedAt: new Date("2025-01-01"),
            coverageSource: "windows_server_hardening",
            coverageTotals: {},
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const result = await verifySnapshotCoverage({
      db: db as any,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_run_found");
    expect(result.stored?.coverageHash).toBe("h1");
    expect(mockComputeEnclaveCoverage).not.toHaveBeenCalled();
  });

  it("returns hash_mismatch when computed hash differs from stored", async () => {
    const storedHash = "abc123";
    const computedHash = "def456";
    mockComputeEnclaveCoverage.mockResolvedValue({
      totals: { pass_fresh: 2 },
      rows: [],
    });
    mockComputeCoverageHash.mockReturnValue(computedHash);

    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      and: vi.fn((...args: unknown[]) => ({ and: args })),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([
          {
            snapshotId: "snap-1",
            coverageHash: storedHash,
            coverageEvidenceRunId: "run-1",
            coverageRunFingerprint: "fp-1",
            coverageCollectedAt: new Date("2025-01-01"),
            coverageSource: "windows_server_hardening",
            coverageTotals: { pass_fresh: 1 },
          },
        ])
        .mockResolvedValueOnce([{ id: "run-1", runFingerprint: "fp-1", collectedAt: new Date("2025-01-01") }]),
    };
    const result = await verifySnapshotCoverage({
      db: db as any,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hash_mismatch");
    expect(result.stored?.coverageHash).toBe(storedHash);
    expect(result.computed?.coverageHash).toBe(computedHash);
  });
});
