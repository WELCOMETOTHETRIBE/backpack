import { describe, it, expect, vi } from "vitest";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { organizationId: "org-1" } }),
}));

vi.mock("@/db", () => {
  const existingRow = {
    id: "boundary-patch-id",
    organizationId: "org-1",
    name: "Existing",
    description: null,
    scopeComponents: ["azure_cloud"],
    azureEnvironment: null,
    cloudProvider: null,
    boundaryType: "cui_enclave",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const updatedRow = {
    ...existingRow,
    scopeComponents: ["siem_logging", "endpoint_detection_response"],
    updatedAt: new Date(),
  };
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingRow]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRow]),
          }),
        }),
      }),
    },
  };
});

vi.mock("@/lib/compliance/azure-inherited-controls", () => ({
  syncOrgAzureInheritedControls: vi.fn().mockResolvedValue(undefined),
}));

describe("PATCH /api/os-baselines/boundaries/[id]", () => {
  it("returns 200 when scope_components is valid", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries/boundary-patch-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_components: ["siem_logging", "endpoint_detection_response"],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "boundary-patch-id" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scopeComponents).toEqual(["siem_logging", "endpoint_detection_response"]);
  });

  it("returns 400 when scope_components contains invalid value", async () => {
    const req = new Request("http://localhost/api/os-baselines/boundaries/boundary-patch-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_components: ["azure_cloud", "defender"],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "boundary-patch-id" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("invalid scope_components");
    expect(data.error).toContain("defender");
  });
});
