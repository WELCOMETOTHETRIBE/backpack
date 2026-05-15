import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  mockRequireOrg: vi.fn(),
  mockRequireRole: vi.fn(),
  mockBuildReconstruction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrg: mocks.mockRequireOrg,
  requireRole: mocks.mockRequireRole,
}));

vi.mock("@/lib/intake/service", () => ({
  buildIntakeReconstructionByTransactionId: mocks.mockBuildReconstruction,
}));

describe("GET /api/intake/transaction/[intakeTransactionId]/reconstruct", () => {
  it("returns reconstruction payload for authorized org", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });
    mocks.mockBuildReconstruction.mockResolvedValue({
      intakeTransactionId: "INTAKE-CLIENT-PROJECT-20260514-0001",
      intakeRequest: { id: "req-1", status: "Closed" },
      uploadedFiles: [{ id: "file-1", sha256Hash: "abc" }],
      metadataEvents: [
        {
          eventType: "intake_upload_authorization",
          eventTimestampUtc: "2026-05-14T10:00:00.000Z",
        },
        {
          eventType: "intake_upload_completed",
          eventTimestampUtc: "2026-05-14T10:05:00.000Z",
        },
      ],
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        intakeTransactionId: "INTAKE-CLIENT-PROJECT-20260514-0001",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intakeTransactionId).toContain("INTAKE-");
    expect(body.uploadedFiles).toHaveLength(1);
    expect(body.metadataEvents).toHaveLength(2);
    expect(new Date(body.metadataEvents[0].eventTimestampUtc).getTime()).toBeLessThan(
      new Date(body.metadataEvents[1].eventTimestampUtc).getTime(),
    );
  });

  it("returns 404 for cross-organization/nonexistent transaction", async () => {
    mocks.mockRequireOrg.mockResolvedValue("org-2");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-2" });
    mocks.mockBuildReconstruction.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ intakeTransactionId: "INTAKE-NOPE-20260514-0001" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects anonymous/unauthorized access", async () => {
    mocks.mockRequireOrg.mockRejectedValue(new Error("Unauthorized: no organization context"));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ intakeTransactionId: "INTAKE-ANY-20260514-0001" }),
    });
    expect(res.status).toBe(401);
  });
});
