import { describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  mockRequireOrg: vi.fn(),
  mockRequireRole: vi.fn(),
  mockTransition: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrg: mocks.mockRequireOrg,
  requireRole: mocks.mockRequireRole,
}));

vi.mock("@/lib/intake/service", () => ({
  transitionIntakeStatus: mocks.mockTransition,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { id: "req-1", status: "Draft", organizationId: "org-1" },
    ]),
  },
}));

describe("PATCH /api/intake/[id]", () => {
  it("blocks restricted status mutation through generic status endpoint", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Closed" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(400);
    expect(mocks.mockTransition).not.toHaveBeenCalled();
  });

  it("rejects unauthorized role mutation attempts", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Rejected" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(401);
  });
});
