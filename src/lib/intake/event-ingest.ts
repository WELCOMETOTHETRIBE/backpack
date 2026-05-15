import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { intakeMetadataEvents, intakeRequests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import {
  type IntakeMetadataEventType,
  type ValidatedIntakeEvent,
} from "@/lib/intake/event-validators";

type IntakeRequestLookup = {
  id: string;
  intakeTransactionId: string;
  organizationId: string;
};

export type IngestOutcome =
  | {
      kind: "accepted" | "idempotent";
      eventId: string;
      ack: string;
      correlationId: string;
      intakeRequestId: string;
      intakeTransactionId: string;
    }
  | {
      kind: "rejected";
      code: "preflight_missing" | "replay_blocked";
      reason: string;
      ack: "rejected" | "replay_blocked";
      correlationId: string;
      intakeRequestId: string;
      intakeTransactionId: string;
      eventId: string;
    };

function ackFromEventType(eventType: IntakeMetadataEventType): string {
  switch (eventType) {
    case "intake_upload_authorization":
      return "preflight_recorded";
    case "intake_upload_started":
      return "upload_started";
    case "intake_upload_completed":
      return "upload_completed";
    case "intake_rejected":
      return "rejected";
    case "intake_expired":
      return "expired";
    case "intake_replay_blocked":
      return "replay_blocked";
  }
}

async function insertRejectedReplayEvent(input: {
  orgId: string;
  intakeRequest: IntakeRequestLookup;
  event: ValidatedIntakeEvent;
  reason: string;
}) {
  const replayEventId = randomUUID();
  await db.insert(intakeMetadataEvents).values({
    eventId: replayEventId,
    organizationId: input.orgId,
    intakeRequestId: input.intakeRequest.id,
    transactionId: input.intakeRequest.intakeTransactionId,
    eventType: "intake_replay_blocked",
    status: "replay_blocked",
    eventTimestampUtc: new Date(),
    timestampBucket: input.event.timestampBucket,
    objectReferenceToken: input.event.objectReferenceToken,
    issuedByActorId: input.event.issuedByActorId,
    recipientEmailHash: input.event.recipientEmailHash,
    artifactType: input.event.artifactType,
    tokenId: input.event.tokenId,
    tokenExpiresAtUtc: input.event.tokenExpiresAtUtc,
    boundaryAssertion: "metadata_only",
    uploadDestination: "azure_blob_direct",
    plannedBundleHashSha256: input.event.plannedBundleHashSha256,
    contentHashSha256: input.event.contentHashSha256,
    sizeBytes: input.event.sizeBytes,
    uploadCompletedAtUtc: input.event.uploadCompletedAtUtc,
    malwareScanStatus: input.event.malwareScanStatus,
    policyVersion: input.event.policyVersion,
    evidenceTraceId: input.event.evidenceTraceId,
    correlationId: input.event.correlationId,
    sourceSystem: "enclavewatch",
    replayKey: input.event.tokenId ?? input.event.eventId,
    decision: "rejected",
    rejectionReason: input.reason,
  });
  return replayEventId;
}

export async function findIntakeRequestByTransaction(input: {
  orgId: string;
  transactionId: string;
}): Promise<IntakeRequestLookup | null> {
  const [row] = await db
    .select({
      id: intakeRequests.id,
      intakeTransactionId: intakeRequests.intakeTransactionId,
      organizationId: intakeRequests.organizationId,
    })
    .from(intakeRequests)
    .where(
      and(
        eq(intakeRequests.organizationId, input.orgId),
        eq(intakeRequests.intakeTransactionId, input.transactionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ingestIntakeMetadataEvent(input: {
  orgId: string;
  via: "session" | "bearer";
  intakeRequest: IntakeRequestLookup;
  event: ValidatedIntakeEvent;
}): Promise<IngestOutcome> {
  const [existingByEventId] = await db
    .select()
    .from(intakeMetadataEvents)
    .where(
      and(
        eq(intakeMetadataEvents.organizationId, input.orgId),
        eq(intakeMetadataEvents.eventId, input.event.eventId),
      ),
    )
    .limit(1);

  if (existingByEventId) {
    return {
      kind: "idempotent",
      eventId: existingByEventId.eventId,
      ack: ackFromEventType(existingByEventId.eventType),
      correlationId: existingByEventId.correlationId ?? input.event.correlationId,
      intakeRequestId: input.intakeRequest.id,
      intakeTransactionId: input.intakeRequest.intakeTransactionId,
    };
  }

  const [existingByBucket] = await db
    .select()
    .from(intakeMetadataEvents)
    .where(
      and(
        eq(intakeMetadataEvents.organizationId, input.orgId),
        eq(intakeMetadataEvents.transactionId, input.event.transactionId),
        eq(intakeMetadataEvents.eventType, input.event.eventType),
        eq(intakeMetadataEvents.timestampBucket, input.event.timestampBucket),
      ),
    )
    .limit(1);

  if (existingByBucket) {
    return {
      kind: "idempotent",
      eventId: existingByBucket.eventId,
      ack: ackFromEventType(existingByBucket.eventType),
      correlationId: existingByBucket.correlationId ?? input.event.correlationId,
      intakeRequestId: input.intakeRequest.id,
      intakeTransactionId: input.intakeRequest.intakeTransactionId,
    };
  }

  if (
    input.event.eventType === "intake_upload_started" ||
    input.event.eventType === "intake_upload_completed"
  ) {
    const [preflight] = await db
      .select({ id: intakeMetadataEvents.id })
      .from(intakeMetadataEvents)
      .where(
        and(
          eq(intakeMetadataEvents.organizationId, input.orgId),
          eq(intakeMetadataEvents.transactionId, input.event.transactionId),
          eq(intakeMetadataEvents.eventType, "intake_upload_authorization"),
          eq(intakeMetadataEvents.decision, "accepted"),
        ),
      )
      .limit(1);

    if (!preflight) {
      return {
        kind: "rejected",
        code: "preflight_missing",
        reason: "preflight metadata event missing",
        ack: "rejected",
        correlationId: input.event.correlationId,
        intakeRequestId: input.intakeRequest.id,
        intakeTransactionId: input.intakeRequest.intakeTransactionId,
        eventId: input.event.eventId,
      };
    }
  }

  if (
    input.event.tokenId &&
    (input.event.eventType === "intake_upload_started" ||
      input.event.eventType === "intake_upload_completed")
  ) {
    const [existingTokenUse] = await db
      .select({ id: intakeMetadataEvents.id, eventType: intakeMetadataEvents.eventType })
      .from(intakeMetadataEvents)
      .where(
        and(
          eq(intakeMetadataEvents.organizationId, input.orgId),
          eq(intakeMetadataEvents.transactionId, input.event.transactionId),
          eq(intakeMetadataEvents.tokenId, input.event.tokenId),
          eq(intakeMetadataEvents.decision, "accepted"),
          inArray(intakeMetadataEvents.eventType, [
            "intake_upload_started",
            "intake_upload_completed",
          ]),
        ),
      )
      .limit(1);

    const allowsExpectedProgression =
      input.event.eventType === "intake_upload_completed" &&
      existingTokenUse?.eventType === "intake_upload_started";

    if (existingTokenUse && !allowsExpectedProgression) {
      const replayEventId = await insertRejectedReplayEvent({
        orgId: input.orgId,
        intakeRequest: input.intakeRequest,
        event: input.event,
        reason: "token already consumed by an accepted lifecycle event",
      });

      return {
        kind: "rejected",
        code: "replay_blocked",
        reason: "token replay blocked",
        ack: "replay_blocked",
        correlationId: input.event.correlationId,
        intakeRequestId: input.intakeRequest.id,
        intakeTransactionId: input.intakeRequest.intakeTransactionId,
        eventId: replayEventId,
      };
    }
  }

  await db.insert(intakeMetadataEvents).values({
    eventId: input.event.eventId,
    organizationId: input.orgId,
    intakeRequestId: input.intakeRequest.id,
    transactionId: input.event.transactionId,
    eventType: input.event.eventType,
    status: input.event.status,
    eventTimestampUtc: input.event.eventTimestampUtc,
    timestampBucket: input.event.timestampBucket,
    objectReferenceToken: input.event.objectReferenceToken,
    issuedByActorId: input.event.issuedByActorId,
    recipientEmailHash: input.event.recipientEmailHash,
    artifactType: input.event.artifactType,
    tokenId: input.event.tokenId,
    tokenExpiresAtUtc: input.event.tokenExpiresAtUtc,
    boundaryAssertion: input.event.boundaryAssertion,
    uploadDestination: input.event.uploadDestination,
    plannedBundleHashSha256: input.event.plannedBundleHashSha256,
    contentHashSha256: input.event.contentHashSha256,
    sizeBytes: input.event.sizeBytes,
    uploadCompletedAtUtc: input.event.uploadCompletedAtUtc,
    malwareScanStatus: input.event.malwareScanStatus,
    policyVersion: input.event.policyVersion,
    evidenceTraceId: input.event.evidenceTraceId,
    correlationId: input.event.correlationId,
    sourceSystem: input.event.sourceSystem,
    replayKey: input.event.tokenId ?? input.event.eventId,
    decision: "accepted",
    rejectionReason: null,
  });

  return {
    kind: "accepted",
    eventId: input.event.eventId,
    ack: ackFromEventType(input.event.eventType),
    correlationId: input.event.correlationId,
    intakeRequestId: input.intakeRequest.id,
    intakeTransactionId: input.intakeRequest.intakeTransactionId,
  };
}

export async function writeIngestAuditLog(input: {
  orgId: string;
  userId?: string | null;
  action: "intake.metadata_event.accepted" | "intake.metadata_event.rejected" | "intake.metadata_event.replay_blocked";
  intakeRequestId: string | null;
  details: Record<string, unknown>;
}) {
  await writeAuditLog({
    organizationId: input.orgId,
    userId: input.userId ?? null,
    action: input.action,
    resourceType: "intake_metadata_event",
    resourceId: input.intakeRequestId,
    details: input.details,
  });
}
