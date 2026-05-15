import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

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
      {
        id: "req-1",
        organizationId: "org-1",
        status: "Draft",
        intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
        authorizationBasis: "contract",
      },
    ]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: "grant-1",
        accessScope: "intake/req-1",
        accessExpiresAt: null,
        tokenReferenceHash: "abc",
      },
    ]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

describe("POST /api/intake/[id]/provision-upload-scope", () => {
  it("never returns raw ephemeral SAS token", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessMethod: "USER_DELEGATION_SAS",
        accessScope: "intake/req-1",
        accessExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        ephemeralToken: "sv=2025-01-01&sig=sensitive",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("sv=2025-01-01");
    expect(JSON.stringify(body)).not.toContain("sig=sensitive");
  });
});
