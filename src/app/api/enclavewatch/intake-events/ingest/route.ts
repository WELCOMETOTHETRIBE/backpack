import { NextResponse } from "next/server";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import {
  findIntakeRequestByTransaction,
  ingestIntakeMetadataEvent,
  writeIngestAuditLog,
} from "@/lib/intake/event-ingest";
import { findForbiddenField, parseIntakeEventPayload } from "@/lib/intake/event-validators";
import { ZodError } from "zod";

export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as unknown | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const forbidden = findForbiddenField(body);
  if (forbidden) {
    await writeIngestAuditLog({
      orgId: ctx.orgId,
      action: "intake.metadata_event.rejected",
      intakeRequestId: null,
      details: {
        decision: "rejected",
        reasonCode: "forbidden_field",
        reason: forbidden.reason,
        fieldPath: forbidden.path,
        via: ctx.via,
      },
    });
    return NextResponse.json(
      { error: `Forbidden field detected at ${forbidden.path}` },
      { status: 400 },
    );
  }

  let event;
  try {
    event = parseIntakeEventPayload(body);
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((issue) => issue.message).join("; ")
        : "Invalid intake event payload";
    await writeIngestAuditLog({
      orgId: ctx.orgId,
      action: "intake.metadata_event.rejected",
      intakeRequestId: null,
      details: {
        decision: "rejected",
        reasonCode: "schema_validation_failed",
        message,
        via: ctx.via,
      },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const request = await findIntakeRequestByTransaction({
    orgId: ctx.orgId,
    transactionId: event.transactionId,
  });
  if (!request) {
    await writeIngestAuditLog({
      orgId: ctx.orgId,
      action: "intake.metadata_event.rejected",
      intakeRequestId: null,
      details: {
        decision: "rejected",
        reasonCode: "intake_not_found",
        transactionId: event.transactionId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        eventType: event.eventType,
        via: ctx.via,
      },
    });
    return NextResponse.json({ error: "Intake request not found" }, { status: 404 });
  }

  const outcome = await ingestIntakeMetadataEvent({
    orgId: ctx.orgId,
    via: ctx.via,
    intakeRequest: request,
    event,
  });

  if (outcome.kind === "rejected") {
    await writeIngestAuditLog({
      orgId: ctx.orgId,
      action:
        outcome.code === "replay_blocked"
          ? "intake.metadata_event.replay_blocked"
          : "intake.metadata_event.rejected",
      intakeRequestId: outcome.intakeRequestId,
      details: {
        decision: "rejected",
        reasonCode: outcome.code,
        reason: outcome.reason,
        eventId: outcome.eventId,
        eventType: event.eventType,
        transactionId: outcome.intakeTransactionId,
        correlationId: outcome.correlationId,
        via: ctx.via,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        ack: outcome.ack,
        error: outcome.reason,
        reason_code: outcome.code,
        event_id: outcome.eventId,
        intake_transaction_id: outcome.intakeTransactionId,
        correlation_id: outcome.correlationId,
      },
      { status: 409 },
    );
  }

  await writeIngestAuditLog({
    orgId: ctx.orgId,
    action: "intake.metadata_event.accepted",
    intakeRequestId: outcome.intakeRequestId,
    details: {
      decision: "accepted",
      idempotent: outcome.kind === "idempotent",
      eventId: outcome.eventId,
      eventType: event.eventType,
      transactionId: outcome.intakeTransactionId,
      correlationId: outcome.correlationId,
      ack: outcome.ack,
      via: ctx.via,
    },
  });

  return NextResponse.json({
    ok: true,
    idempotent: outcome.kind === "idempotent",
    ack: outcome.ack,
    event_id: outcome.eventId,
    intake_request_id: outcome.intakeRequestId,
    intake_transaction_id: outcome.intakeTransactionId,
    correlation_id: outcome.correlationId,
    event_type: event.eventType,
  });
}
