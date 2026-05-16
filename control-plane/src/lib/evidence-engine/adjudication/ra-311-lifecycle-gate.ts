/**
 * RA.L2-3.11.1 — hard gate for CAE / canonical adjudication.
 *
 * Register-only satisfaction (risk_register cadence) is necessary but not
 * sufficient for a defensible MET: the assessment envelope must exist in
 * finalized form with objectives [a]/[b] satisfied and the cycle within the
 * customer-declared frequency window (capped at one year per schema).
 *
 * Elevators (ESP inheritance, POA&M, etc.) bypass this gate inside
 * projectCanonical — they are evaluated before the evidence path applies.
 *
 * Synthetic-evidence guard: smoke-test / fixture / sample records that get
 * finalized during development (e.g. "[SMOKE] MacTech CUI Vault — bridge sync
 * test") would otherwise satisfy this gate identically to a real ARA. They
 * fail every Examine question a C3PAO will ask. Reject them by marker.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { riskAssessments } from "@/db/schema";
import {
  evaluateObjectiveA,
  evaluateObjectiveB,
  type RiskAssessmentRow,
} from "@/lib/risk-assessment/lifecycle";

const ONE_DAY_MS = 86_400_000;

/**
 * Markers that flag an assessment as non-authoritative test data. Match is
 * case-insensitive on any of: assessment_name, system_boundary_name,
 * ssp_reference. A C3PAO will reject any document that self-identifies as
 * a smoke / test / fixture record — we reject it too, by the same logic.
 *
 * Add to this list cautiously: false-positive rejections hold a real RA
 * at in_progress. Keep markers explicit and bracketed/parenthesized so
 * legitimate uses of the words (e.g. "Smoke detection control assessment")
 * don't trip the guard.
 */
const SYNTHETIC_ASSESSMENT_MARKERS = [
  /\[smoke\]/i,
  /\(smoke\)/i,
  /\[test\]/i,
  /\(test\)/i,
  /\[fixture\]/i,
  /\(fixture\)/i,
  /\[seed\]/i,
  /\(seed\)/i,
  /\[demo\]/i,
  /\(demo\)/i,
  /\[sample\]/i,
  /\(sample\)/i,
  /\bsmoke-test\b/i,
];

/** True when ANY visible identifier on the row matches a synthetic marker. */
export function isSyntheticAssessment(
  row: Pick<RiskAssessmentRow, "assessmentName" | "systemBoundaryName" | "sspReference">,
): boolean {
  const haystack = [
    row.assessmentName ?? "",
    row.systemBoundaryName ?? "",
    row.sspReference ?? "",
  ].join("\n");
  return SYNTHETIC_ASSESSMENT_MARKERS.some((re) => re.test(haystack));
}

export type Ra311LifecycleGateResult = {
  satisfied: boolean;
  gap_reason: string | null;
};

/** Pure check — used by the gate and unit tests. */
export function isFinalizedAssessmentWithinFrequencyWindow(
  row: Pick<RiskAssessmentRow, "finalizedAt" | "definedFrequencyDays">,
  nowUtc: Date,
): boolean {
  if (!row.finalizedAt) return false;
  const freqDays = Math.min(row.definedFrequencyDays ?? 366, 366);
  const ageDays =
    (nowUtc.getTime() - row.finalizedAt.getTime()) / ONE_DAY_MS;
  return ageDays <= freqDays;
}

export async function evaluateRa311LifecycleGate(
  orgId: string,
  nowUtc: Date = new Date(),
): Promise<Ra311LifecycleGateResult> {
  // Walk finalized rows newest-first; skip any flagged as synthetic. The
  // assessor's standard is "the most recent REAL assessment within window" —
  // a smoke record being more recent than a real ARA shouldn't override it.
  const candidates = await db
    .select()
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
      ),
    )
    .orderBy(desc(riskAssessments.finalizedAt));

  let row: (typeof candidates)[number] | undefined;
  let skippedSynthetic = 0;
  for (const c of candidates) {
    if (isSyntheticAssessment(c)) {
      skippedSynthetic++;
      continue;
    }
    row = c;
    break;
  }

  if (!row) {
    const suffix = skippedSynthetic > 0
      ? ` (${skippedSynthetic} synthetic/test record(s) skipped — markers like [SMOKE]/[TEST] disqualify a record from satisfying this gate)`
      : "";
    return {
      satisfied: false,
      gap_reason:
        "No finalized risk assessment envelope — complete and finalize the RA lifecycle (TrainOS / readiness wizard) before MET via evidence." + suffix,
    };
  }

  if (!row.finalizedAt) {
    return {
      satisfied: false,
      gap_reason:
        "Finalized assessment row is missing finalized_at (data integrity); rescore after repair.",
    };
  }

  const objA = evaluateObjectiveA(row);
  if (objA.status !== "met") {
    return {
      satisfied: false,
      gap_reason: `Objective [a] not satisfied: ${objA.rationale}`,
    };
  }

  const objB = await evaluateObjectiveB(row);
  if (objB.status !== "met" && objB.status !== "not_applicable") {
    return {
      satisfied: false,
      gap_reason: `Objective [b] not satisfied: ${objB.rationale}`,
    };
  }

  if (!isFinalizedAssessmentWithinFrequencyWindow(row, nowUtc)) {
    const freqDays = Math.min(row.definedFrequencyDays ?? 366, 366);
    const ageDays = Math.round(
      (nowUtc.getTime() - row.finalizedAt.getTime()) / ONE_DAY_MS,
    );
    return {
      satisfied: false,
      gap_reason: `Latest finalized assessment is ${ageDays}d old; defined frequency is ${freqDays}d — start or finalize the next cycle.`,
    };
  }

  return { satisfied: true, gap_reason: null };
}
