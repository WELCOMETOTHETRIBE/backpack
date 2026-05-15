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

const dbState = vi.hoisted(() => ({
  selectCall: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => {
      dbState.selectCall += 1;
      if (dbState.selectCall === 1) {
        return [{ id: "req-1", organizationId: "org-1", status: "Ready for Vault Import" }];
      }
      return [
        {
          id: "file-1",
          intakeRequestId: "req-1",
          malwareScanStatus: "pending",
          sha256Hash: null,
        },
      ];
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: "file-1",
        vaultImportStatus: "imported",
        vaultImportTimestamp: new Date(),
      },
    ]),
  },
}));

describe("POST /api/intake/[id]/record-vault-import", () => {
  it("blocks import when malware scan clean/hash prerequisites are missing", async () => {
    dbState.selectCall = 0;
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1", email: "u@example.com" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: "file-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(409);
    expect(mocks.mockTransition).not.toHaveBeenCalled();
  });
});
