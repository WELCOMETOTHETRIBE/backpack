import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockRequireOrg: vi.fn(),
  mockRequireRole: vi.fn(),
  mockEvaluateClosure: vi.fn(),
  mockTransition: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrg: mocks.mockRequireOrg,
  requireRole: mocks.mockRequireRole,
}));

vi.mock("@/lib/intake/service", () => ({
  evaluateIntakeClosureReadiness: mocks.mockEvaluateClosure,
  transitionIntakeStatus: mocks.mockTransition,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { id: "req-1", status: "Evidence Package Generated", organizationId: "org-1" },
    ]),
  },
}));

describe("POST /api/intake/[id]/close", () => {
  it("blocks closure when required lifecycle conditions are missing", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });
    mocks.mockEvaluateClosure.mockResolvedValue({
      closeable: false,
      requiresException: true,
      missingRequirements: ["hash_generated", "access_revoked_or_expired"],
      openExceptions: [],
    });

    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.missingRequirements).toContain("hash_generated");
    expect(mocks.mockTransition).not.toHaveBeenCalled();
  });

  it("allows closure when formal exception exists", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });
    mocks.mockEvaluateClosure.mockResolvedValue({
      closeable: true,
      requiresException: true,
      missingRequirements: ["vault_import_status_recorded"],
      openExceptions: [{ id: "ex-1", status: "open" }],
    });

    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(200);
    expect(mocks.mockTransition).toHaveBeenCalledTimes(2);
  });
});
