import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findForbiddenField,
  hashRecipientEmail,
  parseIntakeEventPayload,
} from "@/lib/intake/event-validators";

describe("intake event validators", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.INTAKE_RECIPIENT_EMAIL_HASH_PEPPER = "pepper-test";
  });

  it("hashes recipient email deterministically with pepper", () => {
    const a = hashRecipientEmail("User@Example.com");
    const b = hashRecipientEmail(" user@example.com ");
    expect(a).toHaveLength(64);
    expect(a).toBe(b);
  });

  it("parses strict payload and derives defaults", () => {
    const parsed = parseIntakeEventPayload({
      event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      event_type: "intake_upload_authorization",
      transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
      recipient_email: "client@example.gov",
      correlation_id: "corr-1",
      policy_version: "v1",
    });
    expect(parsed.status).toBe("preflight_recorded");
    expect(parsed.recipientEmailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.boundaryAssertion).toBe("metadata_only");
    expect(parsed.uploadDestination).toBe("azure_blob_direct");
  });

  it("normalizes legacy camelCase keys and legacy event aliases", () => {
    const parsed = parseIntakeEventPayload({
      eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      eventType: "intake_upload_initiated",
      transactionId: "INTAKE-ACME-PROJ-20260514-0001",
      correlationId: "corr-legacy",
      policyVersion: "v1",
      boundaryAssertion: "metadata_only",
      uploadDestination: "azure_blob_direct",
      sourceSystem: "enclavewatch",
      status: "started",
    });

    expect(parsed.eventType).toBe("intake_upload_started");
    expect(parsed.status).toBe("upload_started");
    expect(parsed.transactionId).toBe("INTAKE-ACME-PROJ-20260514-0001");
    expect(parsed.correlationId).toBe("corr-legacy");
  });

  it("rejects unknown keys via strict schema", () => {
    expect(() =>
      parseIntakeEventPayload({
        event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
        event_type: "intake_upload_authorization",
        transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
        correlation_id: "corr-1",
        policy_version: "v1",
        unknown_field: "nope",
      }),
    ).toThrow();
  });

  it("flags prohibited raw filename/path keys", () => {
    const found = findForbiddenField({
      event_id: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
      metadata: { original_filename: "CUI-SOW.pdf" },
    });
    expect(found).not.toBeNull();
    expect(found?.path).toContain("original_filename");
  });

  it("flags SAS-like token values", () => {
    const found = findForbiddenField({
      token_ref: "https://acct.blob.core.windows.net/x?sv=2023-11-03&sig=abc123",
    });
    expect(found).not.toBeNull();
    expect(found?.reason).toContain("SAS-like");
  });
});
