import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "./route";

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
    if (boundaryId === "wrong-org-boundary") {
      return NextResponse.json(
        { error: "Invalid or unauthorized boundary", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    return { boundary: { id: boundaryId, organizationId: _orgId, name: "Test Boundary" } };
  }),
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
    boundaryId: "boundary-uuid-1",
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

vi.mock("@/lib/evidence-engine/entry-events", () => ({
  logEntryEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /api/evidence-engine/registers/[registerKey]/entries", () => {
  it("returns 400 VALIDATION_ERROR when boundary_id query is missing", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries");
    const res = await GET(req, { params: Promise.resolve({ registerKey: "access_authorization" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/evidence-engine/registers/[registerKey]/entries", () => {

  it("returns 200 and draft entry for valid body with boundary_id", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "boundary-uuid-1",
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

  it("returns 400 VALIDATION_ERROR when boundary_id is missing", async () => {
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
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toContain("boundary");
  });

  it("returns 400 VALIDATION_ERROR when boundary_id is invalid or wrong org", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "wrong-org-boundary",
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
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 with fields for missing required field", async () => {
    const req = new Request("http://localhost/api/evidence-engine/registers/access_authorization/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary_id: "boundary-uuid-1",
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
