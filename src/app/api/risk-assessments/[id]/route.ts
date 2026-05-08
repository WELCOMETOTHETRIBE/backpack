/**
 * GET    /api/risk-assessments/[id] — read full envelope.
 * PATCH  /api/risk-assessments/[id] — update non-terminal fields.
 *
 * Auth: bridge or session.
 *
 * PATCH is refused on rows in terminal status (finalized | superseded).
 * The supersession flow creates a NEW assessment that points at the
 * old one via supersededByAssessmentId; the old row's content is
 * never edited.
 *
 * PATCH allows status transitions through the editing chain
 * (draft → in_progress → ready_for_review → reviewed →
 * ready_for_approval → approved). The terminal hop to 'finalized'
 * is owned by /finalize, which runs the gate logic. 'superseded' is
 * computed automatically when a new finalize lands.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { riskAssessments } from "@/db/schema";
import {
  authorizeRiskRequest,
  bridgeErrorResponse,
  BRIDGE_CONTRACT_VERSION,
  logRaAuditEvent,
  UpdateAssessmentSchema,
} from "@/lib/risk-assessment-bridge";
import {
  evaluateObjectiveA,
  evaluateObjectiveB,
  TERMINAL_STATUSES,
} from "@/lib/risk-assessment/lifecycle";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  try {
    auth = await authorizeRiskRequest(req, "");
  } catch (e) {
    return bridgeErrorResponse(e);
  }

  const [row] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.id, id),
        eq(riskAssessments.organizationId, auth.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json(
      { error: "Not found", contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: 404 },
    );
  }

  // Computed objective verdicts so TrainOS can show them on its
  // review screen without re-implementing the rule.
  const objA = evaluateObjectiveA(row);
  const objB = await evaluateObjectiveB(row);

  return NextResponse.json({
    ok: true,
    contractVersion: BRIDGE_CONTRACT_VERSION,
    assessment: row,
    computed: { objectiveA: objA, objectiveB: objB },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawBody = await req.text();
  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  let parsed: ReturnType<typeof UpdateAssessmentSchema.safeParse>;
  try {
    auth = await authorizeRiskRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = UpdateAssessmentSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
  const orgId = auth.organizationId;

  const [row] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(eq(riskAssessments.id, id), eq(riskAssessments.organizationId, orgId)),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json(
      { error: "Not found", contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: 404 },
    );
  }
  if (TERMINAL_STATUSES.includes(row.status as "finalized" | "superseded")) {
    return NextResponse.json(
      {
        error: `Assessment is ${row.status}; cannot mutate. Create a new assessment to supersede this one.`,
        contractVersion: BRIDGE_CONTRACT_VERSION,
      },
      { status: 409 },
    );
  }

  // Recompute next_due_date if either of its inputs changed.
  const newFreq = parsed.data.definedFrequencyDays ?? row.definedFrequencyDays;
  const newPeriodEnd = parsed.data.reviewPeriodEnd ?? row.reviewPeriodEnd;
  let nextDueDate: string | null = row.nextDueDate;
  if (
    parsed.data.definedFrequencyDays !== undefined ||
    parsed.data.reviewPeriodEnd !== undefined
  ) {
    if (newFreq && newPeriodEnd) {
      const d = new Date(newPeriodEnd + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + newFreq);
      nextDueDate = d.toISOString().slice(0, 10);
    } else {
      nextDueDate = null;
    }
  }

  // Sign-off timestamps: when status moves to 'reviewed' or 'approved'
  // and the corresponding *_at column is null, stamp it.
  const now = new Date();
  const updates: Partial<typeof row> = {
    assessmentName: parsed.data.assessmentName ?? row.assessmentName,
    organizationName:
      parsed.data.organizationName ?? row.organizationName,
    systemName: parsed.data.systemName ?? row.systemName,
    systemBoundaryName:
      parsed.data.systemBoundaryName ?? row.systemBoundaryName,
    sspReference: parsed.data.sspReference ?? row.sspReference,
    scopeType: parsed.data.scopeType ?? row.scopeType,
    methodology: parsed.data.methodology ?? row.methodology,
    definedFrequencyDays: newFreq,
    frequencyRationale:
      parsed.data.frequencyRationale ?? row.frequencyRationale,
    reviewPeriodStart:
      parsed.data.reviewPeriodStart ?? row.reviewPeriodStart,
    reviewPeriodEnd: newPeriodEnd,
    nextDueDate,
    assessorDisplayName:
      parsed.data.assessorDisplayName ?? row.assessorDisplayName,
    reviewerDisplayName:
      parsed.data.reviewerDisplayName ?? row.reviewerDisplayName,
    approverDisplayName:
      parsed.data.approverDisplayName ?? row.approverDisplayName,
    status: parsed.data.status ?? row.status,
  };
  if (parsed.data.status === "reviewed" && !row.reviewedAt) {
    updates.reviewedAt = now;
    updates.reviewedByUserId = auth.userId ?? null;
  }
  if (parsed.data.status === "approved" && !row.approvedAt) {
    updates.approvedAt = now;
    updates.approvedByUserId = auth.userId ?? null;
  }

  const [updated] = await db
    .update(riskAssessments)
    .set(updates)
    .where(eq(riskAssessments.id, row.id))
    .returning();

  await logRaAuditEvent({
    organizationId: orgId,
    userId: auth.userId,
    action: "risk_assessment.updated",
    resourceType: "risk_assessment",
    resourceId: updated.id,
    details: {
      assessmentPivotId: updated.assessmentPivotId,
      changedFields: Object.keys(parsed.data),
      newStatus: updated.status,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
      controlId: "3.11.1",
    },
    req,
  });

  revalidatePath("/dashboard/controls/3.11.1");
  revalidatePath("/dashboard/readiness/risk-assessment");

  return NextResponse.json({
    ok: true,
    contractVersion: BRIDGE_CONTRACT_VERSION,
    assessment: updated,
  });
}
