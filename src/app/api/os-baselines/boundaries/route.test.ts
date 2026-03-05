import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { organizationId: "org-1" } }),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: "boundary-new-id",
        organizationId: "org-1",
        name: "Test Boundary",
        description: null,
        scopeComponents: null,
        azureEnvironment: null,
        cloudProvider: null,
        boundaryType: "cui_enclave",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  },
}));

vi.mock("@/lib/compliance/azure-inherited-controls", () => ({
  syncOrgAzureInheritedControls: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/os-baselines/boundaries", () => {
  it("returns 400 when name is missing", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("accepts existing scope_components (microsoft_office, windows_server_vm, azure_cloud) and returns 200", async () => {
    const scope = ["microsoft_office", "windows_server_vm", "azure_cloud"];
    const req = new Request("http://localhost/api/os-baselines/boundaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Legacy Boundary", scope_components: scope }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBeDefined();
    expect(data.organizationId).toBe("org-1");
  });

  it("accepts new scope_components (siem_logging, endpoint_detection_response) and returns 200", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Vault Boundary",
        scope_components: ["siem_logging", "endpoint_detection_response", "windows_server_vm"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.organizationId).toBe("org-1");
  });

  it("returns 400 when scope_components contains invalid value", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bad Boundary",
        scope_components: ["azure_cloud", "sentinel"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("invalid scope_components");
    expect(data.error).toContain("sentinel");
  });

  it("dedupes scope_components and returns 200", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Deduped",
        scope_components: ["azure_cloud", "azure_cloud"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const { db } = await import("@/db");
    expect(db.insert).toHaveBeenCalled();
    const valuesCalls = (db.values as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = valuesCalls[valuesCalls.length - 1][0];
    expect(Array.isArray(lastCall.scopeComponents)).toBe(true);
    expect(lastCall.scopeComponents).toContain("azure_cloud");
    expect(lastCall.scopeComponents.length).toBe(1);
  });
});
