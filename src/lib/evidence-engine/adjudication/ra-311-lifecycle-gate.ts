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
  const [row] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
      ),
    )
    .orderBy(desc(riskAssessments.finalizedAt))
    .limit(1);

  if (!row) {
    return {
      satisfied: false,
      gap_reason:
        "No finalized risk assessment envelope — complete and finalize the RA lifecycle (TrainOS / readiness wizard) before MET via evidence.",
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
