/**
 * Permissions audit for POST /api/adjudication/attest.
 *
 * Verifies the route's auth gate (requireRole(["Admin", "Compliance"])) by
 * mocking the session for each role and asserting the correct allow/deny.
 *
 * Body-validation cases (missing fields, unknown templateId, condition not
 * affirmed) also covered to catch regressions in the input contract.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the Clerk session and DB before importing the route.
let stubbedUser:
  | { id: string; email: string; role?: string; organizationId?: string }
  | null = null;

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    auth: async () => (stubbedUser ? { user: stubbedUser } : null),
    getTenantIdFromSession: async () => stubbedUser?.organizationId ?? null,
    requireOrg: async () => {
      if (!stubbedUser?.organizationId) throw new Error("Unauthorized: no organization context");
      return stubbedUser.organizationId;
    },
    requireRole: async (allowed: string[]) => {
      if (!stubbedUser?.id) throw new Error("Unauthorized");
      if (allowed.length && !allowed.includes(stubbedUser.role ?? "")) throw new Error("Forbidden");
      return stubbedUser;
    },
  };
});

// Skip DB writes — return harmless mocks
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [{ id: "rec-1", controlId: "3.13.14" }] }) }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => [{ id: "completion-1" }] }),
        returning: async () => [{ id: "attest-1", dataHash: "deadbeef" }],
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: async () => undefined,
}));

import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/adjudication/attest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  templateId: "na_no_voip",
  controlId: "3.13.14",
  signatoryName: "Patrick Caruso",
  signatoryTitle: "Compliance Officer",
  acceptedConditions: [
    "No customer-managed VoIP gateways / SIP infrastructure in scope",
    "No voice-call recording or storage of CUI",
    "User training includes 'do not discuss CUI on uncontrolled voice channels'",
  ],
};

describe("POST /api/adjudication/attest — permissions", () => {
  beforeEach(() => {
    stubbedUser = null;
  });

  it("Admin role is allowed", async () => {
    stubbedUser = { id: "u1", email: "a@x", role: "Admin", organizationId: "org-1" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it("Compliance role is allowed", async () => {
    stubbedUser = { id: "u1", email: "a@x", role: "Compliance", organizationId: "org-1" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
  });

  it("Assessor role is denied (403)", async () => {
    stubbedUser = { id: "u1", email: "a@x", role: "Assessor", organizationId: "org-1" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("Viewer role is denied (403)", async () => {
    stubbedUser = { id: "u1", email: "a@x", role: "Viewer", organizationId: "org-1" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("Undefined role is denied (403)", async () => {
    stubbedUser = { id: "u1", email: "a@x", organizationId: "org-1" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("No session is denied (401)", async () => {
    stubbedUser = null;
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("Missing organizationId is denied (401)", async () => {
    stubbedUser = { id: "u1", email: "a@x", role: "Admin" };
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/adjudication/attest — input validation", () => {
  beforeEach(() => {
    stubbedUser = { id: "u1", email: "a@x", role: "Compliance", organizationId: "org-1" };
  });

  it("missing templateId returns 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, templateId: undefined }));
    expect(res.status).toBe(400);
  });

  it("missing controlId returns 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, controlId: undefined }));
    expect(res.status).toBe(400);
  });

  it("missing signatoryName returns 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, signatoryName: "" }));
    expect(res.status).toBe(400);
  });

  it("missing signatoryTitle returns 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, signatoryTitle: "" }));
    expect(res.status).toBe(400);
  });

  it("unknown templateId returns 404", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, templateId: "does_not_exist" }));
    expect(res.status).toBe(404);
  });

  it("template/control mismatch returns 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, controlId: "3.1.1" }));
    expect(res.status).toBe(400);
  });

  it("partial condition affirmation returns 400 with fallback", async () => {
    const res = await POST(
      makeReq({ ...VALID_BODY, acceptedConditions: VALID_BODY.acceptedConditions.slice(0, 1) })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.missingConditions.length).toBeGreaterThan(0);
    expect(data.fallback).toBeDefined();
    expect(data.fallback.fallbackDisposition).toBe("partial");
  });

  it("invalid JSON body returns 400", async () => {
    const req = new Request("http://localhost/api/adjudication/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
