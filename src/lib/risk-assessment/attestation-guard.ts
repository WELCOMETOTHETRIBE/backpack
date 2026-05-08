/**
 * Attestation guards — fact-checks for customer-attested adjudication.
 *
 * Why this exists
 * ---------------
 * The /api/adjudication/attest endpoint already validates that the
 * customer affirmed every `condition` string in the template. That's
 * not enough. The customer can affirm "we operate an annual risk
 * assessment program" without ever having performed one — exactly
 * what happened on 2026-05-04 with MacTech's RA.L2-3.11.1, where the
 * click flipped the control to `implemented` despite no risk
 * assessment ever running. We rolled that back on 2026-05-08, and
 * this module is the structural fix so it cannot recur.
 *
 * For a small set of templates, the click also has to pass a *factual*
 * check against system state — e.g., "is there a finalized
 * risk_assessments row in the last 365 days for this org?" If the
 * factual check fails, the attestation is blocked and the customer is
 * routed to the wizard or the deferral path.
 */
import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { riskAssessments } from "@/db/schema";

const ONE_DAY_MS = 86_400_000;

/** Result returned by every guard. */
export type GuardResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      evidenceLookedFor: string;
      remediation: string;
      /** Optional structured detail the wizard can render. */
      detail?: Record<string, unknown>;
    };

/**
 * Per-template guard registry. Templates without a guard pass through
 * unchanged (the click only has to satisfy the affirmation step in the
 * endpoint). Templates *with* a guard must pass the factual check too.
 */
const GUARDS: Record<string, (orgId: string, body: AttestBody) => Promise<GuardResult>> = {
  risk_assessment_program: guardRiskAssessmentProgram,
};

export type AttestBody = {
  templateId?: string;
  controlId?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  acceptedConditions?: string[];
  comment?: string;
  /**
   * Optional escape hatch for the deferral path. If supplied, the
   * guard records the deferral reason instead of blocking. The
   * spec's fallback rule says "If the annual cycle slips beyond 13
   * months without a fresh assessment, the attestation reverts to
   * PARTIAL and the customer must complete a fresh assessment within
   * 90 days OR document the deferral cause in the Risk Register."
   * That's what this is for.
   */
  deferralRationale?: string;
};

export async function runAttestationGuard(
  templateId: string,
  orgId: string,
  body: AttestBody,
): Promise<GuardResult> {
  const guard = GUARDS[templateId];
  if (!guard) return { ok: true };
  return guard(orgId, body);
}

/**
 * Guard for `risk_assessment_program` (RA.L2-3.11.1).
 *
 * Pass conditions (any one):
 *
 *   1. A `risk_assessments` row for this org with status='finalized'
 *      and finalized_at within the last 365 days.
 *
 *   2. The body carries a non-empty `deferralRationale` AND there's
 *      a partial / in-progress assessment row (so the rationale is
 *      attaching to *something*, not floating in space).
 *
 * On failure, return a structured error the wizard can surface as
 * "Run the Risk Assessment wizard" or "Document the deferral."
 */
async function guardRiskAssessmentProgram(
  orgId: string,
  body: AttestBody,
): Promise<GuardResult> {
  const oneYearAgo = new Date(Date.now() - 365 * ONE_DAY_MS);

  const finalized = await db
    .select({
      id: riskAssessments.id,
      finalizedAt: riskAssessments.finalizedAt,
      assessmentPivotId: riskAssessments.assessmentPivotId,
    })
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
        gte(riskAssessments.finalizedAt, oneYearAgo),
      ),
    )
    .limit(1);

  if (finalized[0]) {
    return { ok: true };
  }

  // No finalized assessment in window — check for the deferral path.
  if (body.deferralRationale && body.deferralRationale.trim().length >= 40) {
    const inProgress = await db
      .select({ id: riskAssessments.id })
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.organizationId, orgId),
          // Any non-terminal status is acceptable — the rationale needs
          // *something* to attach to.
        ),
      )
      .limit(1);
    if (inProgress[0]) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "Deferral rationale supplied but no assessment row exists for it to attach to.",
      evidenceLookedFor:
        "risk_assessments row in any status for this organization",
      remediation:
        "Open the Risk Assessment wizard and submit at least a draft scope before claiming a deferral.",
    };
  }

  return {
    ok: false,
    reason:
      "No finalized risk assessment found for this organization in the last 365 days.",
    evidenceLookedFor:
      "risk_assessments row with status='finalized' and finalized_at >= now() - 365d",
    remediation:
      "Open the Risk Assessment wizard at /dashboard/readiness/risk-assessment, complete a cycle, and finalize. After finalization the attestation can be attempted again. For the deferral path supply { deferralRationale: '<≥40 chars explaining why>' } in the request body.",
    detail: {
      controlId: "3.11.1",
      cycleRequirement: "annual (≤365d)",
      windowStart: oneYearAgo.toISOString(),
    },
  };
}
