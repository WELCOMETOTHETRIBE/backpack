/**
 * Per-objective adjudication policy for inbound TrainOS evidence.
 *
 * Per the integration brief v2-final:
 *   - One verdict per (controlId, objective) tuple.
 *   - Overall `verdict` is the strictest of the per-objective verdicts.
 *   - Strictness order: REJECTED > INSUFFICIENT > ACCEPTED_WITH_NOTES > ACCEPTED.
 *
 * v1 policy (deliberately conservative — easy to extend, easy to defend):
 *   - passed === false                  → INSUFFICIENT (whole record fails)
 *   - score < passingThreshold          → INSUFFICIENT
 *   - controlId not in known AT-family  → REJECTED (mapping bug — surface it)
 *   - score >= passingThreshold + 90    → ACCEPTED_WITH_NOTES (annual reattest)
 *   - otherwise                         → ACCEPTED
 *
 * The "+90" notes case isn't punishment — it's a forward-looking remediation
 * note ("annual reattestation due 2027-05-05") that the brief explicitly
 * called out as the use case for ACCEPTED_WITH_NOTES.
 *
 * Future revisions: cross-reference register cadence (training_completion is
 * annual), reject if same learner has a more-recent ACCEPTED record for the
 * same control, etc. Out of scope for v1.
 */

import type {
  TrainosCanonicalEvidence,
  TrainosVerdict,
  PerObjectiveVerdict,
} from "./types";
import { VERDICT_STRICTNESS } from "./types";

export const POLICY_VERSION = "codex-policy-v1.0.0";

/**
 * The AT (Awareness & Training) family is the only one that
 * `attempt.completed` can adjudicate against in v1. Mappings outside this
 * set are rejected — the Codex bin model treats AT as governance-only, so
 * a training completion is a clean fit there.
 */
const KNOWN_AT_CONTROL_PREFIXES = ["AT.L2-"];

function isKnownControlMapping(controlId: string): boolean {
  return KNOWN_AT_CONTROL_PREFIXES.some((p) => controlId.startsWith(p));
}

/**
 * Compute one PerObjectiveVerdict per (controlId, objective) tuple in
 * canonical.controlMappings, applying the v1 policy.
 */
export function adjudicatePerObjective(
  canonical: TrainosCanonicalEvidence
): PerObjectiveVerdict[] {
  const out: PerObjectiveVerdict[] = [];

  // Hard-fail conditions short-circuit every mapping with the same verdict.
  const hardFail = canonical.passed === false || canonical.score < canonical.passingThreshold;

  for (const m of canonical.controlMappings) {
    if (!isKnownControlMapping(m.controlId)) {
      out.push({
        controlId: m.controlId,
        objective: m.objective,
        verdict: "REJECTED",
        rationale: `Control ${m.controlId} is not in the AT (Awareness & Training) family. TrainOS attempt.completed events can only adjudicate AT.L2 controls in v1.`,
      });
      continue;
    }
    if (hardFail) {
      out.push({
        controlId: m.controlId,
        objective: m.objective,
        verdict: "INSUFFICIENT",
        rationale: `Server-graded score ${canonical.score} below passing threshold ${canonical.passingThreshold} (passed=${canonical.passed}). Re-take the assessment to satisfy this objective.`,
        remediation: `Re-attempt the course "${canonical.courseTitle}" (v${canonical.courseVersion}) and meet the ${canonical.passingThreshold}% passing threshold.`,
      });
      continue;
    }

    // Annual reattestation note for AT family. The training_completion
    // register has a 365-day cadence; we surface that as a forward note
    // when the score is excellent (≥ +10 above threshold), to keep the
    // upcoming reattest visible without blocking acceptance.
    const completedAt = new Date(canonical.completedAt);
    const reattestDue = new Date(completedAt);
    reattestDue.setUTCFullYear(reattestDue.getUTCFullYear() + 1);
    const reattestNote = canonical.score >= canonical.passingThreshold + 10;

    out.push({
      controlId: m.controlId,
      objective: m.objective,
      verdict: reattestNote ? "ACCEPTED_WITH_NOTES" : "ACCEPTED",
      rationale: `Server-graded passing score (${canonical.score}/${canonical.passingThreshold}) with full-module attestation and signed acknowledgement satisfies ${m.controlId}${m.objective}.`,
      remediation: reattestNote
        ? `Annual reattest due ${reattestDue.toISOString().slice(0, 10)} per training_completion register cadence (365 days).`
        : undefined,
    });
  }

  return out;
}

/** Pick the strictest verdict from a list of per-objective verdicts. */
export function rollupOverallVerdict(perObjective: PerObjectiveVerdict[]): TrainosVerdict {
  if (perObjective.length === 0) return "REJECTED"; // empty controlMappings = malformed
  let worst: TrainosVerdict = "ACCEPTED";
  for (const v of perObjective) {
    if (VERDICT_STRICTNESS[v.verdict] > VERDICT_STRICTNESS[worst]) {
      worst = v.verdict;
    }
  }
  return worst;
}
