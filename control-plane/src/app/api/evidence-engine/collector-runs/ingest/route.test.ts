import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  requireOrg: vi.fn().mockResolvedValue("test-org-id"),
  requireRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/evidence-engine/validate-boundary", () => ({
  requireBoundaryForOrg: vi.fn().mockImplementation(async (_orgId: string, boundaryId: string | null | undefined) => {
    if (!boundaryId || String(boundaryId).trim() === "") {
      return NextResponse.json({ error: "boundary_id required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (boundaryId === "wrong-org-boundary" || boundaryId === "00000000-0000-0000-0000-000000000000") {
      return NextResponse.json({ error: "Invalid or unauthorized boundary", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    return { boundary: { id: boundaryId, organizationId: _orgId, name: "Test Boundary" } };
  }),
}));

const validRunManifest = {
  schema: "mactech.collector.run-manifest.v1",
  version: "1.0.0",
  run_id: "20260305T074916Z-a00d8782",
  organization_id: "b6e1b0e2-c589-4c72-8cd2-43de8619fced",
  boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
  collector: { name: "cui-evidence-collector", version: "2.0.0" },
  host: { hostname: "HOST", os: "Windows" },
  timing: { started_at: "2026-03-05T07:49:16Z", ended_at: "2026-03-05T07:49:16Z", duration_seconds: 10 },
  summary: { checks_total: 10, pass: 8, fail: 1, warn: 1, error: 0, na: 0, overall_status: "fail" },
  artifacts: { outputs_root: "C:\\runs\\x", control_results_path: "C:\\runs\\x\\control_results.json", evidence_index_path: "C:\\runs\\x\\evidence_index.json" },
};

const validControlResults = {
  schema: "mactech.collector.control-results.v1",
  version: "1.0.0",
  run_id: "20260305T074916Z-a00d8782",
  organization_id: "b6e1b0e2-c589-4c72-8cd2-43de8619fced",
  boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
  results: {
    "AC.L2-3.1.3": { status: "pass" },
    "IA.L2-3.5.3": { status: "fail" },
  },
};

const validEvidenceIndex = {
  schema: "mactech.collector.evidence-index.v1",
  version: "1.0.0",
  run_id: "20260305T074916Z-a00d8782",
  organization_id: "b6e1b0e2-c589-4c72-8cd2-43de8619fced",
  boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
  files: [
    { path: "host/systeminfo.txt", sha256: "0000000000000000000000000000000000000000000000000000000000000000", bytes: 100, exportable: false },
    { path: "network/summary.txt", sha256: "1111111111111111111111111111111111111111111111111111111111111111", bytes: 200, exportable: true },
  ],
};

const mockState = vi.hoisted(() => ({
  entryInsertCalls: [] as unknown[],
  fileInsertCalls: [] as unknown[],
  insertCallCount: 0,
}));

const mockRegister = {
  id: "reg-tech-run",
  organizationId: "test-org-id",
  registerKey: "technical_compliance_run",
  name: "Technical Compliance Run",
  description: null,
  projectId: null,
  requiredColumns: null,
  retainForDays: null,
  defaultCadenceDays: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEntry = {
  id: "entry-uuid-1",
  registerId: "reg-tech-run",
  boundaryId: "boundary-uuid-1",
  entryType: "collector_run",
  status: "draft",
  entryData: {},
  createdById: null,
  finalizedAt: null,
  finalizedById: null,
  hold: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@/db", () => {
  const reg = {
    id: "reg-tech-run",
    organizationId: "test-org-id",
    registerKey: "technical_compliance_run",
    name: "Technical Compliance Run",
    description: null,
    projectId: null,
    requiredColumns: null,
    retainForDays: null,
    defaultCadenceDays: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const entry = {
    id: "entry-uuid-1",
    registerId: "reg-tech-run",
    boundaryId: "boundary-uuid-1",
    entryType: "collector_run",
    status: "draft",
    entryData: {},
    createdById: null,
    finalizedAt: null,
    finalizedById: null,
    hold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([reg]),
      insert: vi.fn().mockImplementation(() => {
        mockState.insertCallCount += 1;
        const isFirst = mockState.insertCallCount === 1;
        return {
          values: vi.fn().mockImplementation((v: unknown) => {
            if (isFirst) {
              mockState.entryInsertCalls.push(v);
              return { returning: vi.fn().mockResolvedValue([{ ...entry, id: "entry-created-1" }]) };
            }
            mockState.fileInsertCalls.push(v);
            return Promise.resolve();
          }),
        };
      }),
    },
  };
});

vi.mock("@/lib/evidence-engine/control-dashboard", () => ({
  ensureEvidenceEngineRegistersForOrg: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/evidence-engine/entry-events", () => ({
  logEntryEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/evidence-engine/collector-runs/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.entryInsertCalls = [];
    mockState.fileInsertCalls = [];
    mockState.insertCallCount = 0;
  });

  it("returns 400 when boundary_id is missing", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run-1",
        vault_outputs_root: "/vault/run-1",
        run_manifest: validRunManifest,
        control_results: validControlResults,
        evidence_index: validEvidenceIndex,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("boundary_id");
  });

  it("returns 400 when boundary_id is invalid or wrong org", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "wrong-org-boundary",
        run_id: "run-1",
        vault_outputs_root: "/vault/run-1",
        run_manifest: validRunManifest,
        control_results: validControlResults,
        evidence_index: validEvidenceIndex,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when run_manifest fails schema validation", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
        run_id: "run-1",
        vault_outputs_root: "/vault/run-1",
        run_manifest: { schema: "wrong", version: "1.0.0" },
        control_results: validControlResults,
        evidence_index: validEvidenceIndex,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("SCHEMA_ERROR");
    expect(data.error).toContain("run_manifest");
    expect(Array.isArray(data.errors)).toBe(true);
  });

  it("returns 400 when control_results fails schema validation", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
        run_id: "run-1",
        vault_outputs_root: "/vault/run-1",
        run_manifest: validRunManifest,
        control_results: { schema: "wrong", version: "1.0.0", results: {} },
        evidence_index: validEvidenceIndex,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("SCHEMA_ERROR");
    expect(data.error).toContain("control_results");
  });

  it("returns 400 when evidence_index fails schema validation", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
        run_id: "run-1",
        vault_outputs_root: "/vault/run-1",
        run_manifest: validRunManifest,
        control_results: validControlResults,
        evidence_index: { schema: "mactech.collector.evidence-index.v1", version: "1.0.0", files: [{ path: "x", sha256: "bad", bytes: 0 }] },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("SCHEMA_ERROR");
    expect(data.error).toContain("evidence_index");
  });

  it("returns 201 and creates entry and attachment rows for valid payload", async () => {
    const req = new Request("http://localhost/api/evidence-engine/collector-runs/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "e2a587cf-fd7d-4ce6-b224-a56db31fa52d",
        run_id: "run-123",
        vault_outputs_root: "/vault/runs/run-123",
        run_manifest: validRunManifest,
        control_results: validControlResults,
        evidence_index: validEvidenceIndex,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.entryId).toBeDefined();
    expect(data.run_id).toBe("run-123");
    expect(data.boundary_id).toBe("e2a587cf-fd7d-4ce6-b224-a56db31fa52d");
    expect(mockState.entryInsertCalls.length).toBeGreaterThanOrEqual(1);
    const entryPayload = mockState.entryInsertCalls[0] as Record<string, unknown>;
    expect(entryPayload.entryType).toBe("collector_run");
    expect(entryPayload.status).toBe("draft");
    const entryData = entryPayload.entryData as Record<string, unknown>;
    expect(entryData.run_id).toBe("run-123");
    expect(entryData.control_results).toEqual(validControlResults.results);
    expect(mockState.fileInsertCalls.length).toBe(2);
    const file1 = mockState.fileInsertCalls[0] as Record<string, unknown>;
    const file2 = mockState.fileInsertCalls[1] as Record<string, unknown>;
    expect(file1.fileUrl).toContain("/vault/runs/run-123");
    expect(file1.originalFilename).toBe("systeminfo.txt");
    expect(file1.exportable).toBe(false);
    expect(file1.sha256Hash).toBe(validEvidenceIndex.files[0].sha256);
    expect(file2.exportable).toBe(true);
  });
});
