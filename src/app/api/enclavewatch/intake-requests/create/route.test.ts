import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockResolveOrg: vi.fn(),
  mockValidateFk: vi.fn(),
  mockNextTxnId: vi.fn(),
  mockReturning: vi.fn(),
  mockValues: vi.fn(),
  mockInsert: vi.fn(),
  mockWriteAuditLog: vi.fn(),
  mockLimit: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/auth-bearer", () => ({
  resolveOrgFromSessionOrBearer: mocks.mockResolveOrg,
}));

vi.mock("@/lib/intake/service", () => ({
  nextIntakeTransactionId: mocks.mockNextTxnId,
  validateIntakeForeignKeys: mocks.mockValidateFk,
}));

vi.mock("@/db", () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
  },
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: mocks.mockWriteAuditLog,
}));

describe("POST /api/enclavewatch/intake-requests/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockLimit.mockResolvedValue([]);
    mocks.mockWhere.mockReturnValue({ limit: mocks.mockLimit });
    mocks.mockFrom.mockReturnValue({ where: mocks.mockWhere });
    mocks.mockSelect.mockReturnValue({ from: mocks.mockFrom });
    mocks.mockReturning.mockResolvedValue([
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        intakeTransactionId: "INTAKE-CLIENT-INTAKE-20260514-0001",
        organizationId: "org-uuid",
        status: "Draft",
        title: "Vault-managed customer intake",
        createdAt: new Date("2026-05-14T12:00:00.000Z"),
      },
    ]);
    mocks.mockValues.mockReturnValue({ returning: mocks.mockReturning });
    mocks.mockInsert.mockReturnValue({ values: mocks.mockValues });
    mocks.mockNextTxnId.mockResolvedValue("INTAKE-CLIENT-INTAKE-20260514-0001");
    mocks.mockValidateFk.mockResolvedValue(undefined);
  });

  it("returns 401 without auth context", async () => {
    mocks.mockResolveOrg.mockResolvedValue(null);
    const req = new Request("http://localhost", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates intake request with bearer org resolution", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-uuid", via: "bearer" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-token",
      },
      body: JSON.stringify({
        title: "Bootstrap smoke",
        clientCode: "CLIENT",
        projectCode: "INTAKE",
        expectedClassification: "CUI",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.intake_transaction_id).toBe("INTAKE-CLIENT-INTAKE-20260514-0001");
    expect(body.intake_request_id).toBe("550e8400-e29b-41d4-a716-446655440000");

    expect(mocks.mockValidateFk).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-uuid",
        clientId: null,
        projectId: null,
        contractId: null,
        assignedReviewerUserId: null,
      }),
    );
    expect(mocks.mockInsert).toHaveBeenCalled();
    expect(mocks.mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intake.request.created_via_enclavewatch_bootstrap",
        resourceType: "intake_request",
      }),
    );
  });

  it("rejects unknown JSON keys", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-uuid", via: "bearer" });
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", unexpected: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts vault intakeTransactionId and inserts Awaiting Upload", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-uuid", via: "bearer" });
    mocks.mockReturning.mockResolvedValue([
      {
        id: "660e8400-e29b-41d4-a716-446655440001",
        intakeTransactionId: "tx-demo-001",
        organizationId: "org-uuid",
        status: "Awaiting Upload",
        title: "Vault-managed customer intake",
        createdAt: new Date("2026-05-14T12:00:00.000Z"),
      },
    ]);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeTransactionId: "tx-demo-001" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.intake_transaction_id).toBe("tx-demo-001");
    expect(body.status).toBe("Awaiting Upload");
    expect(mocks.mockNextTxnId).not.toHaveBeenCalled();
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        intakeTransactionId: "tx-demo-001",
        status: "Awaiting Upload",
      }),
    );
  });

  it("returns 200 when intakeTransactionId already exists", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-uuid", via: "bearer" });
    mocks.mockLimit.mockResolvedValue([
      {
        id: "770e8400-e29b-41d4-a716-446655440002",
        intakeTransactionId: "tx-dup",
        organizationId: "org-uuid",
        status: "Awaiting Upload",
        title: "Existing",
        createdAt: new Date("2026-05-14T11:00:00.000Z"),
      },
    ]);

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeTransactionId: "tx-dup" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.already_exists).toBe(true);
    expect(body.intake_transaction_id).toBe("tx-dup");
    expect(mocks.mockInsert).not.toHaveBeenCalled();
  });
});
