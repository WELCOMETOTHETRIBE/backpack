import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "./route";

const mockBoundary = {
  id: "boundary-export-test-id",
  organizationId: "test-org-id",
  name: "Test Export Boundary",
  scopeComponents: ["vm", "db"],
  cloudProvider: "azure",
  azureEnvironment: "Gov",
  boundaryType: "cui_enclave",
};

vi.mock("@/lib/auth", () => ({
  requireOrg: vi.fn().mockResolvedValue("test-org-id"),
  requireRole: vi.fn().mockResolvedValue({ id: "test-user-id" }),
}));

vi.mock("@/lib/evidence-engine/validate-boundary", () => ({
  requireBoundaryForOrg: vi.fn().mockImplementation(async (_orgId: string, boundaryId: string | null | undefined) => {
    if (!boundaryId || String(boundaryId).trim() === "") {
      return NextResponse.json(
        { error: "boundary_id required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    return { boundary: { ...mockBoundary, id: boundaryId } };
  }),
}));

vi.mock("@/lib/evidence-engine/control-dashboard", () => ({
  ensureEvidenceEngineRegistersForOrg: vi.fn().mockResolvedValue(undefined),
  getRegisterStatsForOrgAndBoundary: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/storage", () => ({
  getStorageService: vi.fn().mockReturnValue({ getDownloadUrl: vi.fn().mockResolvedValue("https://example.com/file") }),
}));

vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve);
  chain.catch = (fn: (e: unknown) => unknown) => Promise.resolve([]).catch(fn);
  return { db: chain };
});

describe("GET /api/evidence-engine/export/auditor-bundle", () => {
  it("returns 400 when boundary_id is missing", async () => {
    const req = new Request("http://localhost/api/evidence-engine/export/auditor-bundle");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 and ZIP containing boundary.json", async () => {
    const req = new Request("http://localhost/api/evidence-engine/export/auditor-bundle?boundary_id=boundary-export-test-id");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    const buffer = Buffer.from(await res.arrayBuffer());
    const str = buffer.toString("utf8");
    expect(str).toContain("boundary.json");
    expect(str).toContain("README.txt");
  });
});
