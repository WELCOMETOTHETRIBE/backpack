import { describe, it, expect, vi } from "vitest";
import { buildSSPMdx } from "./ssp-generator";

const mockBoundaryRow = vi.hoisted(() => ({
  id: "boundary-1",
  organizationId: "org-1",
  name: "CUI Vault – Azure Gov",
  description: null,
  scopeComponents: ["windows_server_vm", "azure_cloud"],
  azureEnvironment: "gov",
  cloudProvider: "azure",
  boundaryType: "cui_enclave",
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const dbMock = vi.hoisted(() => {
  let whereCallCount = 0;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockImplementation(() => {
    whereCallCount++;
    if (whereCallCount === 1) return Promise.resolve([mockBoundaryRow]);
    if (whereCallCount === 2) return Promise.resolve([]);
    return chain;
  });
  chain.orderBy = vi.fn().mockResolvedValue([]);
  return chain;
});

vi.mock("@/db", () => ({
  db: dbMock,
}));

vi.mock("./control-dashboard", () => ({
  getRegisterStatsForOrgAndBoundary: vi.fn().mockResolvedValue(new Map()),
}));

describe("buildSSPMdx", () => {
  it("includes System Boundary section with boundary name and metadata", async () => {
    const mdx = await buildSSPMdx("org-1", "boundary-1");
    expect(mdx).toContain("## System Boundary");
    expect(mdx).toContain("**Name:** CUI Vault – Azure Gov");
    expect(mdx).toContain("CUI Vault – Azure Gov");
    expect(mdx).toContain("**Components:**");
    expect(mdx).toContain("windows_server_vm, azure_cloud");
    expect(mdx).toContain("**Cloud Provider:**");
    expect(mdx).toContain("Microsoft Azure Government");
    expect(mdx).toContain("**Cloud Environment:**");
    expect(mdx).toContain("Gov");
  });
});
