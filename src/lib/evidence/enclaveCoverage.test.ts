import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeEnclaveCoverage } from "./enclaveCoverage";
import type { RunFindingEntry } from "./bulkFindings";

vi.mock("@/lib/compliance/enclaveManifest", () => ({
  getEnclaveMappedControls: () => ["3.1.1", "3.1.2", "3.1.3"],
}));

const mockGetRunFindingsByControl = vi.fn();
const mockGetControlLayerMapFromLatestSnapshot = vi.fn();
vi.mock("@/lib/evidence/bulkFindings", () => ({
  getRunFindingsByControl: (...args: unknown[]) => mockGetRunFindingsByControl(...args),
}));
vi.mock("@/lib/boundary/getControlLayerMap", () => ({
  getControlLayerMapFromLatestSnapshot: (...args: unknown[]) =>
    mockGetControlLayerMapFromLatestSnapshot(...args),
}));

function runEntry(overrides: Partial<RunFindingEntry> = {}): RunFindingEntry {
  return {
    pass: true,
    controlIdRaw: "3.1.1",
    observed: "ok",
    expected: "ok",
    ...overrides,
  };
}

describe("computeEnclaveCoverage", () => {
  const nowUtc = "2025-06-01T12:00:00Z";
  const collectedAtFresh = "2025-05-20T00:00:00Z"; // 12 days ago
  const collectedAtStale = "2024-06-01T00:00:00Z"; // ~1 year ago

  let mockLimit: ReturnType<typeof vi.fn>;
  let mockWhere: ReturnType<typeof vi.fn>;
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit = vi.fn().mockResolvedValue([
      { collectedAt: new Date(collectedAtStale), runFingerprint: "fp-test" },
    ]);
    mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    mockDb = { select: mockSelect };
  });

  it("buckets no_finding when run has no findings for a control", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(new Map());
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(new Map());

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.totals.enclave_controls).toBe(3);
    expect(summary.totals.no_finding).toBe(3);
    expect(summary.totals.pass_fresh).toBe(0);
    expect(summary.totals.pass_stale).toBe(0);
    expect(summary.totals.pass_unknown_layer).toBe(0);
    expect(summary.totals.fail).toBe(0);
    expect(summary.rows.every((r) => r.bucket === "no_finding")).toBe(true);
    expect(summary.top_gaps.no_finding).toEqual(["3.1.1", "3.1.2", "3.1.3"]);
  });

  it("buckets fail when finding has pass false", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(
      new Map([
        ["3.1.1", runEntry({ pass: false, controlIdRaw: "3.1.1" })],
        ["3.1.2", runEntry({ pass: true, controlIdRaw: "3.1.2" })],
        ["3.1.3", runEntry({ pass: false, controlIdRaw: "3.1.3" })],
      ])
    );
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(
      new Map([
        ["3.1.1", "GuestOS/Hardening"],
        ["3.1.2", "GuestOS/Hardening"],
        ["3.1.3", "GuestOS/Hardening"],
      ])
    );

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.totals.fail).toBe(2);
    expect(summary.totals.pass_stale).toBe(1); // 3.1.2 pass, layer 90d, collectedAt is stale
    expect(summary.top_gaps.failed).toContain("3.1.1");
    expect(summary.top_gaps.failed).toContain("3.1.3");
  });

  it("buckets pass_unknown_layer when layer is null", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(
      new Map([
        ["3.1.1", runEntry({ controlIdRaw: "3.1.1" })],
        ["3.1.2", runEntry({ controlIdRaw: "3.1.2" })],
      ])
    );
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(
      new Map([
        ["3.1.1", null],
        ["3.1.2", null],
      ])
    );

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.totals.pass_unknown_layer).toBe(2);
    expect(summary.totals.no_finding).toBe(1); // 3.1.3
    expect(summary.top_gaps.unknown_layer).toEqual(["3.1.1", "3.1.2"]);
  });

  it("buckets pass_fresh when within freshness window", async () => {
    mockLimit.mockResolvedValue([
      { collectedAt: new Date(collectedAtFresh), runFingerprint: "fp" },
    ]);
    mockGetRunFindingsByControl.mockResolvedValue(
      new Map([["3.1.1", runEntry({ controlIdRaw: "3.1.1" })]])
    );
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(
      new Map([["3.1.1", "GuestOS/Hardening"]])
    );

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.totals.pass_fresh).toBe(1);
    expect(summary.totals.no_finding).toBe(2);
    expect(summary.rows.find((r) => r.control_id === "3.1.1")?.freshness_status).toBe("fresh");
  });

  it("buckets pass_stale when past freshness window", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(
      new Map([
        ["3.1.1", runEntry({ controlIdRaw: "3.1.1" })],
        ["3.1.2", runEntry({ controlIdRaw: "3.1.2" })],
      ])
    );
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(
      new Map([
        ["3.1.1", "GuestOS/Hardening"],
        ["3.1.2", "Identity/MFA"],
      ])
    );

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.totals.pass_stale).toBe(2);
    expect(summary.top_gaps.stale).toEqual(["3.1.1", "3.1.2"]);
    expect(summary.rows.find((r) => r.control_id === "3.1.1")?.remediation_hint).toContain("Re-run");
  });

  it("sorts rows by control_id deterministically", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(new Map());
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(new Map());

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    const ids = summary.rows.map((r) => r.control_id);
    expect(ids).toEqual(["3.1.1", "3.1.2", "3.1.3"]);
  });

  it("top_gaps arrays are bounded", async () => {
    mockGetRunFindingsByControl.mockResolvedValue(new Map());
    mockGetControlLayerMapFromLatestSnapshot.mockResolvedValue(new Map());

    const summary = await computeEnclaveCoverage({
      db: mockDb,
      organizationId: "org-1",
      accountId: "org-1",
      boundaryId: "b-1",
      evidenceRunId: "run-1",
      source: "windows_server_hardening",
      nowUtc,
    });

    expect(summary.top_gaps.no_finding.length).toBeLessThanOrEqual(10);
    expect(summary.top_gaps.unknown_layer.length).toBeLessThanOrEqual(10);
    expect(summary.top_gaps.stale.length).toBeLessThanOrEqual(10);
    expect(summary.top_gaps.failed.length).toBeLessThanOrEqual(10);
  });
});
