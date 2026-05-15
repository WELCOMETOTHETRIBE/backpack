import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestIntakeMetadataEvent, type IngestOutcome } from "@/lib/intake/event-ingest";
import type { ValidatedIntakeEvent } from "@/lib/intake/event-validators";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as Array<unknown[]>,
  insertValues: [] as Array<Record<string, unknown>>,
  select: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => (mocks.selectQueue.shift() ?? []) as unknown[]),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      mocks.insertValues.push(values);
      return [values];
    }),
  })),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

function baseEvent(overrides: Partial<ValidatedIntakeEvent> = {}): ValidatedIntakeEvent {
  return {
    eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
    eventType: "intake_upload_authorization",
    status: "preflight_recorded",
    transactionId: "INTAKE-ACME-PROJ-20260514-0001",
    objectReferenceToken: "INTAKEOBJ-XYZ",
    issuedByActorId: "admin-1",
    recipientEmailHash: "a".repeat(64),
    artifactType: "upload_bundle",
    tokenId: "token-1",
    tokenExpiresAtUtc: new Date("2026-05-16T12:00:00.000Z"),
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
    ...overrides,
  };
}

const intakeRequest = {
  id: "req-1",
  intakeTransactionId: "INTAKE-ACME-PROJ-20260514-0001",
  organizationId: "org-1",
};

describe("intake metadata event ingest service", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.insertValues.length = 0;
    vi.clearAllMocks();
  });

  it("returns idempotent result when event_id already exists", async () => {
    mocks.selectQueue.push([
      {
        eventId: "65c91593-8e7c-4d7a-89e9-44daf00d6c0d",
        eventType: "intake_upload_authorization",
        correlationId: "corr-1",
      },
    ]);

    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent(),
    });

    expect(outcome.kind).toBe("idempotent");
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("blocks upload_started when preflight metadata does not exist", async () => {
    mocks.selectQueue.push([], [], []);
    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({
        eventType: "intake_upload_started",
        status: "upload_started",
      }),
    });

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.code).toBe("preflight_missing");
    }
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("accepts upload_started after preflight record exists", async () => {
    mocks.selectQueue.push([], [], [{ id: "preflight-1" }], []);
    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({
        eventType: "intake_upload_started",
        status: "upload_started",
        eventId: "1ba3b8c4-98d5-4774-a9b7-f6fdd0cc0fdf",
        timestampBucket: "202605141201",
      }),
    });

    expect(outcome.kind).toBe("accepted");
    expect(mocks.insertValues).toHaveLength(1);
    expect(mocks.insertValues[0]?.eventType).toBe("intake_upload_started");
  });

  it("writes replay_blocked metadata row when token replay is detected", async () => {
    mocks.selectQueue.push([], [], [{ id: "preflight-1" }], [{ id: "token-used" }]);
    const outcome = (await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({
        eventType: "intake_upload_completed",
        status: "upload_completed",
        eventId: "2106da28-b94f-4e11-a3b1-57db2ff6600f",
        timestampBucket: "202605141202",
      }),
    })) as IngestOutcome;

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.code).toBe("replay_blocked");
      expect(outcome.ack).toBe("replay_blocked");
    }
    expect(mocks.insertValues).toHaveLength(1);
    expect(mocks.insertValues[0]?.eventType).toBe("intake_replay_blocked");
    expect(mocks.insertValues[0]?.decision).toBe("rejected");
  });

  it("returns idempotent result on fallback replay bucket key", async () => {
    mocks.selectQueue.push(
      [],
      [
        {
          eventId: "old-event-id",
          eventType: "intake_upload_authorization",
          correlationId: "corr-old",
        },
      ],
    );

    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({ eventId: "new-id-should-idempot" }),
    });

    expect(outcome.kind).toBe("idempotent");
    if (outcome.kind !== "rejected") {
      expect(outcome.eventId).toBe("old-event-id");
    }
  });

  it("records upload completion integrity metadata in accepted event row", async () => {
    mocks.selectQueue.push([], [], [{ id: "preflight-1" }], []);
    const completeAt = new Date("2026-05-14T12:07:00.000Z");

    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({
        eventType: "intake_upload_completed",
        status: "upload_completed",
        eventId: "e69f2c48-7727-4b4f-b16c-9dbdf5d45055",
        timestampBucket: "202605141207",
        contentHashSha256: "c".repeat(64),
        sizeBytes: 4096,
        uploadCompletedAtUtc: completeAt,
        malwareScanStatus: "pending",
      }),
    });

    expect(outcome.kind).toBe("accepted");
    expect(mocks.insertValues).toHaveLength(1);
    expect(mocks.insertValues[0]?.contentHashSha256).toBe("c".repeat(64));
    expect(mocks.insertValues[0]?.sizeBytes).toBe(4096);
    expect(mocks.insertValues[0]?.uploadCompletedAtUtc).toEqual(completeAt);
  });

  it("allows upload_completed after an accepted upload_started with the same token", async () => {
    mocks.selectQueue.push([], [], [{ id: "preflight-1" }], [
      { id: "started-accepted-1", eventType: "intake_upload_started" },
    ]);

    const outcome = await ingestIntakeMetadataEvent({
      orgId: "org-1",
      via: "bearer",
      intakeRequest,
      event: baseEvent({
        eventType: "intake_upload_completed",
        status: "upload_completed",
        eventId: "2e95f4e2-2f9c-41a5-a7bb-5981732c3b84",
        timestampBucket: "202605141210",
        contentHashSha256: "d".repeat(64),
        sizeBytes: 2048,
        uploadCompletedAtUtc: new Date("2026-05-14T12:10:00.000Z"),
      }),
    });

    expect(outcome.kind).toBe("accepted");
    expect(mocks.insertValues).toHaveLength(1);
    expect(mocks.insertValues[0]?.eventType).toBe("intake_upload_completed");
    expect(mocks.insertValues[0]?.decision).toBe("accepted");
  });
});
