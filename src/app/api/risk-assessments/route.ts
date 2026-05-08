/**
 * POST /api/risk-assessments
 *
 * Create a new risk assessment lifecycle envelope. TrainOS calls this
 * once when the customer starts a fresh annual cycle. Codex returns
 * { id, assessmentPivotId } that TrainOS must remember and supply on
 * every subsequent call (PATCH metadata, POST risks, finalize, …).
 *
 * Idempotent on assessmentPivotId — if TrainOS retries the create
 * after a transient error, the same pivot id returns the same row.
 *
 * Auth: bridge or session.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { boundaries } from "@/db/schema";
import {
  authorizeRiskRequest,
  bridgeErrorResponse,
  CreateAssessmentSchema,
  logRaAuditEvent,
  BRIDGE_CONTRACT_VERSION,
} from "@/lib/risk-assessment-bridge";
import { ensureAssessmentEnvelope } from "@/lib/risk-assessment/lifecycle";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  let parsed: ReturnType<typeof CreateAssessmentSchema.safeParse>;
  try {
    auth = await authorizeRiskRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = CreateAssessmentSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }

  const { organizationId } = auth;

  // Boundary must belong to this org.
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(
      and(
        eq(boundaries.id, parsed.data.boundaryId),
        eq(boundaries.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!boundary) {
    return NextResponse.json(
      {
        error: "Boundary not found for this org.",
        boundaryId: parsed.data.boundaryId,
        contractVersion: BRIDGE_CONTRACT_VERSION,
      },
      { status: 422 },
    );
  }

  const pivotId = parsed.data.assessmentPivotId ?? randomUUID();

  const envelope = await ensureAssessmentEnvelope({
    organizationId,
    boundaryId: boundary.id,
    assessmentPivotId: pivotId,
    assessmentName: parsed.data.assessmentName ?? null,
    organizationName: parsed.data.organizationName ?? null,
    systemName: parsed.data.systemName ?? null,
    systemBoundaryName: parsed.data.systemBoundaryName ?? null,
    sspReference: parsed.data.sspReference ?? null,
    assessorDisplayName: parsed.data.assessorDisplayName ?? null,
    reviewPeriodStart: parsed.data.reviewPeriodStart ?? null,
    reviewPeriodEnd: parsed.data.reviewPeriodEnd ?? null,
    definedFrequencyDays: parsed.data.definedFrequencyDays ?? null,
    frequencyRationale: parsed.data.frequencyRationale ?? null,
    submittedByUserId: auth.userId,
  });

  await logRaAuditEvent({
    organizationId,
    userId: auth.userId,
    action: "risk_assessment.created",
    resourceType: "risk_assessment",
    resourceId: envelope.id,
    details: {
      assessmentPivotId: pivotId,
      boundaryId: boundary.id,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
      controlId: "3.11.1",
    },
    req,
  });

  return NextResponse.json(
    {
      ok: true,
      id: envelope.id,
      assessmentPivotId: envelope.assessmentPivotId,
      status: envelope.status,
      contractVersion: BRIDGE_CONTRACT_VERSION,
    },
    { status: 201 },
  );
}
