import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  controlRecords,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateControlStatus } from "@/lib/control-status";
import { writeAuditLog } from "@/lib/audit";
import { ensureAssessmentEnvelope } from "@/lib/risk-assessment/lifecycle";
import { randomUUID } from "crypto";

/**
 * The customer-defined cadence for RA.L2-3.11.1[a]. Defaults to 365 days
 * (annual) — the wizard doesn't currently let the customer pick a
 * tighter cadence, but the lifecycle schema and objective evaluator
 * support anything ≤ 366 days. Wire this to a wizard control when the
 * conversation comes up.
 */
const DEFAULT_FREQUENCY_DAYS = 365;

/**
 * POST /api/risk-assessment/submit
 *
 * Endpoint for the Phase-1 Annual Risk Assessment wizard. Accepts the
 * assembled assessment payload (scope, identified risks, sign-off) and
 * writes one final risk_identified entry into the risk_register per
 * selected scenario. Returns the count of entries written.
 *
 * Tied to control 3.11.1 (Risk Assessment) — the resulting register
 * entries serve as operational evidence the assessment ran, alongside
 * the signed risk_assessment_program attestation and the uploaded
 * annual report PDF.
 *
 * Auth: session only (the wizard is operator-facing, never agent-facing).
 */

const LIKELIHOOD = ["rare", "unlikely", "possible", "likely", "almost_certain"] as const;
const IMPACT = ["low", "moderate", "high", "critical"] as const;
const TREATMENT = ["mitigate", "accept", "transfer", "avoid"] as const;

type Likelihood = (typeof LIKELIHOOD)[number];
type Impact = (typeof IMPACT)[number];
type Treatment = (typeof TREATMENT)[number];

type Risk = {
  scenarioId: string;
  riskStatement: string;
  likelihood: Likelihood;
  impact: Impact;
  existingControls: string[];
  treatment: Treatment;
  owner: string;
  targetDate: string | null;
  notes: string | null;
};

type Body = {
  registerId: string;
  boundaryId: string;
  scope: {
    statement: string;
    reviewPeriodStart: string;
    reviewPeriodEnd: string;
    assessor: string;
    methodology: string;
  };
  risks: Risk[];
  signoff: {
    preparer: string;
    reviewer: string | null;
    approver: string;
    signOffDate: string;
  };
};

const BANNED_SIGNER_PATTERNS = [/\bclaude\b/i, /\bcodex\b/i, /\bagent\b/i, /\bAI\b/, /\bGPT\b/i];

function isHumanName(name: string): boolean {
  if (name.trim().length < 2) return false;
  return !BANNED_SIGNER_PATTERNS.some((re) => re.test(name));
}

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as { organizationId?: string; id?: string; email?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Validate ────────────────────────────────────────────────────
  if (!body.registerId || !body.boundaryId) {
    return NextResponse.json({ error: "registerId and boundaryId required" }, { status: 400 });
  }
  if (!body.scope?.statement || body.scope.statement.trim().length < 10) {
    return NextResponse.json({ error: "scope.statement is too short" }, { status: 400 });
  }
  if (!body.scope.assessor || !body.scope.reviewPeriodStart || !body.scope.reviewPeriodEnd) {
    return NextResponse.json({ error: "scope.assessor and review period required" }, { status: 400 });
  }
  if (!Array.isArray(body.risks) || body.risks.length === 0) {
    return NextResponse.json({ error: "At least one risk must be identified" }, { status: 400 });
  }
  for (const r of body.risks) {
    if (!r.scenarioId || !r.riskStatement) {
      return NextResponse.json({ error: "Each risk requires scenarioId + riskStatement" }, { status: 400 });
    }
    if (!LIKELIHOOD.includes(r.likelihood)) {
      return NextResponse.json({ error: `Invalid likelihood: ${r.likelihood}` }, { status: 400 });
    }
    if (!IMPACT.includes(r.impact)) {
      return NextResponse.json({ error: `Invalid impact: ${r.impact}` }, { status: 400 });
    }
    if (!TREATMENT.includes(r.treatment)) {
      return NextResponse.json({ error: `Invalid treatment: ${r.treatment}` }, { status: 400 });
    }
    if (!r.owner || r.owner.trim().length < 2) {
      return NextResponse.json({ error: `Owner required for ${r.scenarioId}` }, { status: 400 });
    }
    if (r.treatment !== "accept" && !r.targetDate) {
      return NextResponse.json(
        { error: `Target date required for non-accept treatment on ${r.scenarioId}` },
        { status: 400 },
      );
    }
  }
  if (!body.signoff?.preparer || !body.signoff.approver || !body.signoff.signOffDate) {
    return NextResponse.json({ error: "Preparer, approver, and sign-off date required" }, { status: 400 });
  }
  if (!isHumanName(body.signoff.preparer)) {
    return NextResponse.json(
      { error: "Preparer must be a human name — AI/agent signers are not accepted" },
      { status: 400 },
    );
  }
  if (!isHumanName(body.signoff.approver)) {
    return NextResponse.json(
      { error: "Approver must be a human name — AI/agent signers are not accepted" },
      { status: 400 },
    );
  }

  // ── Verify org owns the register + boundary ────────────────────
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(and(eq(boundaries.id, body.boundaryId), eq(boundaries.organizationId, orgId)))
    .limit(1);
  if (!boundary) {
    return NextResponse.json({ error: "Boundary not found for this org" }, { status: 404 });
  }
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(eq(governanceRegisters.id, body.registerId), eq(governanceRegisters.organizationId, orgId)),
    )
    .limit(1);
  if (!register) {
    return NextResponse.json({ error: "Register not found for this org" }, { status: 404 });
  }

  // ── Insert risk entries ────────────────────────────────────────
  const assessmentId = randomUUID();
  const now = new Date();
  const identifiedAt = now.toISOString();
  const userId = user?.id ?? null;
  let inserted = 0;

  for (const r of body.risks) {
    const riskId = `RA-${body.scope.reviewPeriodEnd}-${r.scenarioId}-${randomUUID().slice(0, 8)}`;
    const entryData = {
      // risk_register schema fields (entry_type=risk_identified)
      risk_id: riskId,
      identified_at: identifiedAt,
      identified_by: body.scope.assessor,
      risk_statement: r.riskStatement,
      likelihood: r.likelihood,
      impact: r.impact,
      owner: r.owner,
      affected_systems: [body.boundaryId],
      notes: r.notes,
      // Extension fields used by the wizard (allowed; schema lists them as optional via `extra`)
      assessment_id: assessmentId,
      scenario_id: r.scenarioId,
      methodology: body.scope.methodology,
      review_period_start: body.scope.reviewPeriodStart,
      review_period_end: body.scope.reviewPeriodEnd,
      scope_statement: body.scope.statement,
      treatment_strategy: r.treatment,
      target_date: r.targetDate,
      existing_controls: r.existingControls,
      preparer: body.signoff.preparer,
      reviewer: body.signoff.reviewer,
      approver: body.signoff.approver,
      sign_off_date: body.signoff.signOffDate,
    };

    await db.insert(governanceRegisterEntries).values({
      registerId: register.id,
      boundaryId: boundary.id,
      entryData,
      entryType: "risk_identified",
      status: "final",
      finalizedAt: now,
      createdById: userId,
    });
    inserted++;
  }

  // ── Recompute 3.11.1 status so the new evidence is reflected ──
  const [rec] = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(and(eq(controlRecords.organizationId, orgId), eq(controlRecords.controlId, "3.11.1")))
    .limit(1);
  if (rec) {
    await calculateControlStatus(rec.id).catch(() => null);
  }

  // ── Lifecycle envelope ─────────────────────────────────────────
  // The wizard writes per-risk rows above. We also stamp a
  // `risk_assessments` row that owns the lifecycle (objective [a]/[b]
  // status, sign-off chain, finalize-eligible). Idempotent on
  // assessment_pivot_id.
  let envelope: Awaited<ReturnType<typeof ensureAssessmentEnvelope>> | null = null;
  try {
    envelope = await ensureAssessmentEnvelope({
      organizationId: orgId,
      boundaryId: boundary.id,
      assessmentPivotId: assessmentId,
      reviewPeriodStart: body.scope.reviewPeriodStart,
      reviewPeriodEnd: body.scope.reviewPeriodEnd,
      definedFrequencyDays: DEFAULT_FREQUENCY_DAYS,
      assessorDisplayName: body.scope.assessor,
      reviewerDisplayName: body.signoff.reviewer ?? null,
      approverDisplayName: body.signoff.approver,
      submittedByUserId: userId,
    });
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "risk_assessment.submitted",
      resourceType: "risk_assessment",
      resourceId: envelope.id,
      details: {
        assessmentPivotId: assessmentId,
        boundaryId: boundary.id,
        risksCount: inserted,
        controlId: "3.11.1",
      },
    });
  } catch (err) {
    // Soft-fail: per-risk rows already landed, the customer's data is
    // safe; the envelope is "extra." Surface a stderr line so the
    // operator notices, but don't block the wizard's response.
    console.error(
      JSON.stringify({
        event: "risk_assessment_envelope_failed",
        orgId,
        assessmentId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  console.log(
    JSON.stringify({
      event: "risk_assessment_submitted",
      orgId,
      assessmentId,
      registerId: register.id,
      boundaryId: boundary.id,
      inserted,
      assessor: body.scope.assessor,
      preparer: body.signoff.preparer,
      approver: body.signoff.approver,
    }),
  );

  return NextResponse.json({
    ok: true,
    assessmentId,
    riskAssessmentId: envelope?.id ?? null,
    registerId: register.id,
    inserted,
  });
}
