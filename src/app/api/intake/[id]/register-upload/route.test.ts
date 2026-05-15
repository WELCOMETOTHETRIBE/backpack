import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockRequireOrg: vi.fn(),
  mockRequireRole: vi.fn(),
  mockTransition: vi.fn(),
  insertedValues: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth", () => ({
  requireOrg: mocks.mockRequireOrg,
  requireRole: mocks.mockRequireRole,
}));

vi.mock("@/lib/intake/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intake/service")>(
    "@/lib/intake/service",
  );
  return {
    ...actual,
    transitionIntakeStatus: mocks.mockTransition,
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: "req-1",
        organizationId: "org-1",
        status: "Awaiting Upload",
        intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
      },
    ]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      mocks.insertedValues.push(payload);
      return {
        returning: vi.fn().mockResolvedValue([
          {
            ...payload,
            id: "file-1",
          },
        ]),
      };
    }),
  },
}));

describe("POST /api/intake/[id]/register-upload metadata minimization", () => {
  it("tokenizes filename and avoids persisting raw bytes/content", async () => {
    mocks.insertedValues.length = 0;
    mocks.mockRequireOrg.mockResolvedValue("org-1");
    mocks.mockRequireRole.mockResolvedValue({ id: "user-1" });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalFilename: "CUI-Prime-Contract-StatementOfWork.pdf",
        blobPath: "client-a/project-x/CUI-Prime-Contract-StatementOfWork.pdf",
        contentType: "application/pdf",
        fileSize: 12345,
        fileBytes: "JVBERi0xLjQKJ...", // should never be persisted
        extractedText: "sensitive text", // should never be persisted
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "req-1" }) });
    expect(res.status).toBe(201);
    const payload = mocks.insertedValues[0];
    expect(payload).toBeDefined();
    expect(String(payload.originalFilename)).toMatch(/^INTAKEOBJ-/);
    expect(String(payload.originalFilename)).not.toContain("StatementOfWork");
    expect(String(payload.blobPath)).toMatch(/^redacted:\/\/blob\//);
    expect(String(payload.blobPath)).not.toContain("client-a/project-x");
    expect(String(payload.originalFilenameHash)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(payload.blobPathHash)).toMatch(/^[a-f0-9]{64}$/);
    expect(payload).not.toHaveProperty("fileBytes");
    expect(payload).not.toHaveProperty("extractedText");
  });
});
