import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  mockResolveOrg: vi.fn(),
  mockFindForbiddenField: vi.fn(),
  mockParseIntakeEventPayload: vi.fn(),
  mockFindIntakeRequestByTransaction: vi.fn(),
  mockIngestIntakeMetadataEvent: vi.fn(),
  mockWriteIngestAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth-bearer", () => ({
  resolveOrgFromSessionOrBearer: mocks.mockResolveOrg,
}));

vi.mock("@/lib/intake/event-validators", () => ({
  findForbiddenField: mocks.mockFindForbiddenField,
  parseIntakeEventPayload: mocks.mockParseIntakeEventPayload,
}));

vi.mock("@/lib/intake/event-ingest", () => ({
  findIntakeRequestByTransaction: mocks.mockFindIntakeRequestByTransaction,
  ingestIntakeMetadataEvent: mocks.mockIngestIntakeMetadataEvent,
  writeIngestAuditLog: mocks.mockWriteIngestAuditLog,
}));

describe("POST /api/enclavewatch/intake-events/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects forbidden payload fields with structured audit", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-1", via: "bearer" });
    mocks.mockFindForbiddenField.mockReturnValue({
      path: "raw_content",
      reason: "prohibited metadata field key detected",
    });
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
        event_type: "intake_upload_authorization",
        transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
        raw_content: "plaintext",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Forbidden field");
    expect(mocks.mockWriteIngestAuditLog).toHaveBeenCalled();
  });

  it("returns success ack for accepted preflight metadata event", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-1", via: "bearer" });
    mocks.mockFindForbiddenField.mockReturnValue(null);
    mocks.mockParseIntakeEventPayload.mockReturnValue({
      eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      eventType: "intake_upload_authorization",
      status: "preflight_recorded",
      transactionId: "INTAKE-ACME-PROJ-20260514-0001",
      objectReferenceToken: "INTAKEOBJ-123",
      issuedByActorId: "admin-1",
      recipientEmailHash: "a".repeat(64),
      artifactType: "upload_package",
      tokenId: "token-1",
      tokenExpiresAtUtc: new Date("2026-05-15T12:00:00.000Z"),
      eventTimestampUtc: new Date("2026-05-14T12:00:00.000Z"),
      timestampBucket: "202605141200",
      boundaryAssertion: "metadata_only",
      uploadDestination: "azure_blob_direct",
      plannedBundleHashSha256: "b".repeat(64),
      contentHashSha256: null,
      sizeBytes: null,
      uploadCompletedAtUtc: null,
      malwareScanStatus: null,
      policyVersion: "v1",
      evidenceTraceId: "trace-1",
      correlationId: "corr-1",
      sourceSystem: "enclavewatch",
    });
    mocks.mockFindIntakeRequestByTransaction.mockResolvedValue({
      id: "req-1",
      intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
      organizationId: "org-1",
    });
    mocks.mockIngestIntakeMetadataEvent.mockResolvedValue({
      kind: "accepted",
      eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      ack: "preflight_recorded",
      correlationId: "corr-1",
      intakeRequestId: "req-1",
      intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
    });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
        event_type: "intake_upload_authorization",
        transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
        correlation_id: "corr-1",
        policy_version: "v1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ack).toBe("preflight_recorded");
  });

  it("returns fail-closed response when gate/replay rejects event", async () => {
    mocks.mockResolveOrg.mockResolvedValue({ orgId: "org-1", via: "bearer" });
    mocks.mockFindForbiddenField.mockReturnValue(null);
    mocks.mockParseIntakeEventPayload.mockReturnValue({
      eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      eventType: "intake_upload_started",
      status: "upload_started",
      transactionId: "INTAKE-ACME-PROJ-20260514-0001",
      objectReferenceToken: "INTAKEOBJ-123",
      issuedByActorId: "admin-1",
      recipientEmailHash: "a".repeat(64),
      artifactType: "upload_package",
      tokenId: "token-1",
      tokenExpiresAtUtc: new Date("2026-05-15T12:00:00.000Z"),
      eventTimestampUtc: new Date("2026-05-14T12:00:00.000Z"),
      timestampBucket: "202605141200",
      boundaryAssertion: "metadata_only",
      uploadDestination: "azure_blob_direct",
      plannedBundleHashSha256: "b".repeat(64),
      contentHashSha256: null,
      sizeBytes: null,
      uploadCompletedAtUtc: null,
      malwareScanStatus: null,
      policyVersion: "v1",
      evidenceTraceId: "trace-1",
      correlationId: "corr-1",
      sourceSystem: "enclavewatch",
    });
    mocks.mockFindIntakeRequestByTransaction.mockResolvedValue({
      id: "req-1",
      intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
      organizationId: "org-1",
    });
    mocks.mockIngestIntakeMetadataEvent.mockResolvedValue({
      kind: "rejected",
      code: "replay_blocked",
      reason: "token replay blocked",
      ack: "replay_blocked",
      correlationId: "corr-1",
      intakeRequestId: "req-1",
      intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
      eventId: "f6e6f4df-6738-4f0b-b4c0-b7e8866c2322",
    });

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
        event_type: "intake_upload_started",
        transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
        correlation_id: "corr-1",
        policy_version: "v1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason_code).toBe("replay_blocked");
  });
});
