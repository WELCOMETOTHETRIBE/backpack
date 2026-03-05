import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  requireOrg: vi.fn().mockResolvedValue("test-org-id"),
  requireRole: vi.fn().mockResolvedValue({ id: "test-user-id" }),
}));

vi.mock("@/db", () => {
  const mockRegister = {
    id: "reg-uuid-1",
    organizationId: "test-org-id",
    registerKey: "access_authorization",
    name: "Access Authorization",
    description: null,
    projectId: null,
    requiredColumns: null,
    retainForDays: null,
    defaultCadenceDays: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockEntry = {
    id: "entry-uuid-1",
    registerId: "reg-uuid-1",
    entryType: "grant_access",
    status: "draft",
    entryData: { subject_user: "alice", approver: "bob", approved_at: "2025-01-15" },
    createdById: "test-user-id",
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
      where: vi.fn().mockResolvedValue([mockRegister]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([mockEntry]),
    },
  };
});

vi.mock("@/lib/governance/audit", () => ({
  logGovernanceAudit: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/evidence-engine/registers/[registerKey]/entries", () => {

  it("returns 200 and draft entry for valid body", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type: "grant_access",
        entryData: {
          subject_user: "alice",
          system: "prod",
          requested_role: "viewer",
          approver: "bob",
          approved_at: "2025-01-15",
          justification: "Access request approved",
        },
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ registerKey: "access_authorization" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("draft");
    expect(data.entryType).toBe("grant_access");
  });

  it("returns 400 with fields for missing required field", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry_type: "grant_access",
        entryData: {
          subject_user: "alice",
          approver: "bob",
          // missing approved_at, justification, system, requested_role
        },
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ registerKey: "access_authorization" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.fields).toBeDefined();
    expect(typeof data.fields).toBe("object");
  });
});
