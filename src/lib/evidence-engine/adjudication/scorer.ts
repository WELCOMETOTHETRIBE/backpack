/**
 * Phase 7 — Control Adjudication Engine (CAE).
 *
 * For every CMMC control, score the current state of operational evidence
 * against the control's register_requirements and emit a verdict:
 *
 *   status     ∈ { satisfies, partial, gap, at_risk }
 *   confidence ∈ [0, 1]
 *   requirements[]   per-requirement pass/fail breakdown with up to 5
 *                    evidence_entry_ids click-through to the entry
 *                    detail page.
 *
 * Snapshots persist to control_adjudication_snapshots so the UI can show
 * trend lines over time. Re-scoring the same manifest is a no-op replace
 * (period_basis_manifest_id is the natural idempotency key).
 *
 * STATUS MAPPING:
 *   satisfies — every requirement satisfied AND cadence is fresh
 *   partial   — at least one requirement satisfied, at least one not
 *   gap       — zero requirements satisfied
 *   at_risk   — every requirement satisfied today BUT one or more is
 *               within 25% of cadence expiry (e.g., 23-day cadence with
 *               18 days since last evidence). Drives Phase 8 predictive
 *               lanes — the system flags it BEFORE it actually fails.
 *
 * CONFIDENCE FACTORS (ad-hoc weighted):
 *   - +0.4  every requirement satisfied
 *   - +0.2  at least one entry per requirement carries lifecycle_state =
 *           isso_verified (i.e., not just admin_signed)
 *   - +0.2  most_recent_evidence is within cadence_days * 0.5
 *   - +0.1  manifest signature is fresh (<14d since last weekly export)
 *   - +0.1  evidence volume above min_final_entries floor
 *
 * Caps at 1.0; partial / gap / at_risk get scaled-down confidence.
 *
 * §11 PRINCIPLE: Confidence and status are DERIVED from observed entries —
 * never hand-set. The scorer's job is to compute, not to opinionate.
 */

import { db } from "@/db";
import {
  controlAdjudicationSnapshots,
  controlRecords,
  governanceRegisters,
  governanceRegisterEntries,
  issoExportManifests,
  poamEntries,
} from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import type { ControlAssessmentControl } from "@/data/cmmc/types";
import { canPoamElevate } from "@/lib/canonical-state/auto-poam";
import {
  evaluateRa311LifecycleGate,
  type Ra311LifecycleGateResult,
} from "@/lib/evidence-engine/adjudication/ra-311-lifecycle-gate";

export type AdjudicationStatus = "satisfies" | "partial" | "gap" | "at_risk";

/**
 * C3PAO-facing aggregate finding per 32 CFR § 170.24 [AG p.10]:
 *   MET    — every applicable assessment objective satisfied
 *   NOT_MET — at least one objective not satisfied
 *   NA      — operator-declared not applicable with rationale
 *
 * Derived from `status` (the rollup) + legacy implementation_status +
 * the four AG p.10–11 MET-elevators (ESP inheritance, enduring
 * exception, DoD CIO adjudication, operational plan of action).
 */
export type AggregateFinding = "MET" | "NOT_MET" | "NA";

/**
 * How the requirement reaches MET (or doesn't):
 *   evidence — native MET via cited evidence rows
 *   esp_inheritance — AG p.11 elevator
 *   enduring_exception — AG p.10 elevator (with mitigations in SSP)
 *   dod_cio_adjudication — AG p.10 elevator
 *   operational_plan_of_action — AG p.10 elevator (POA&M with required fields)
 *   not_met — no elevator active
 *   not_applicable — operator-declared
 */
export type MetVia =
  | "evidence"
  | "enduring_exception"
  | "operational_plan_of_action"
  | "dod_cio_adjudication"
  | "esp_inheritance"
  | "not_met"
  | "not_applicable";

export interface ObjectiveVerdict {
  objective: string; // "a" | "b" | …
  verdict: AggregateFinding;
  evidence_ids: string[];
  rationale: string | null;
}

export interface RequirementResult {
  register_key: string;
  required_min: number;
  observed_final: number;
  observed_isso_verified: number;
  cadence_days_required: number;
  cadence_days_actual: number | null;
  satisfied: boolean;
  evidence_entry_ids: string[];
  gap_reason?: string;
}

export interface ControlAdjudication {
  control_id: string;
  /**
   * Internal CAE rollup (satisfies / partial / gap / at_risk). Useful
   * for sorting + colors on dashboards. Not C3PAO-facing — surfaces
   * should render `aggregate_finding` instead.
   */
  status: AdjudicationStatus;
  confidence: number;
  requirements: RequirementResult[];
  computed_at: Date;
  most_recent_manifest_id: string | null;

  /**
   * Canonical fields — produced by scoreControl directly. Replace the
   * separate "rescore-trigger projector" that used to overwrite the
   * snapshot via a second UPDATE. Now the scorer is the single source
   * of truth: produce + persist in one pass.
   */
  aggregate_finding: AggregateFinding;
  met_via: MetVia;
  objective_verdicts: ObjectiveVerdict[];
  enduring_exception_id: string | null;
  operational_plan_poam_id: string | null;
  dod_cio_adjudication_id: string | null;
  esp_inheritance: Record<string, unknown> | null;
}

interface ScoreContext {
  orgId: string;
  manifestId?: string | null;
  /**
   * Look-back window. CAE evaluates entries in the last `lookbackDays` to
   * decide if a register requirement is satisfied. Default 90 to match
   * common CMMC review cadences. Phase 8 risk projection uses this window.
   */
  lookbackDays?: number;
}

/**
 * Score one control. Reads register entries, applies the requirement
 * checks, returns the verdict + snapshot.
 */
export async function scoreControl(
  ctx: ScoreContext,
  controlId: string,
): Promise<ControlAdjudication | null> {
  const logic = getControlAssessmentLogic();
  const control = logic.controls.find((c) => c.control_id === controlId);
  if (!control) return null;

  const lookback = ctx.lookbackDays ?? 90;
  const now = new Date();
  const since = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000);

  const requirements: RequirementResult[] = [];

  for (const requirement of control.register_requirements) {
    requirements.push(
      await scoreRequirement(ctx.orgId, requirement, since, now),
    );
  }

  let ra311Gate: Ra311LifecycleGateResult | null = null;
  if (controlId === "3.11.1") {
    ra311Gate = await evaluateRa311LifecycleGate(ctx.orgId, now);
    requirements.push({
      register_key: "risk_assessment_envelope",
      required_min: 1,
      observed_final: ra311Gate.satisfied ? 1 : 0,
      observed_isso_verified: 0,
      cadence_days_required: 0,
      cadence_days_actual: null,
      satisfied: ra311Gate.satisfied,
      evidence_entry_ids: [],
      gap_reason: ra311Gate.gap_reason ?? undefined,
    });
  }

  const status = mapStatus(control, requirements, now);
  const confidence = computeConfidence(control, requirements, status);

  // ── Canonical projection ────────────────────────────────────────
  // The CAE is the single source of truth. It produces the rollup
  // (satisfies/partial/gap/at_risk) AND the C3PAO-facing canonical
  // fields (aggregate_finding, met_via, objective_verdicts +
  // elevator pointers) in one pass. The rescore-trigger no longer
  // post-processes the snapshot via a second UPDATE — there's
  // nothing to project.
  const canonical = await projectCanonical(
    ctx.orgId,
    controlId,
    status,
    ra311Gate,
  );

  return {
    control_id: controlId,
    status,
    confidence,
    requirements,
    computed_at: now,
    most_recent_manifest_id: ctx.manifestId ?? null,
    aggregate_finding: canonical.aggregateFinding,
    met_via: canonical.metVia,
    objective_verdicts: canonical.objectiveVerdicts,
    enduring_exception_id: canonical.enduringExceptionId,
    operational_plan_poam_id: canonical.operationalPlanPoamId,
    dod_cio_adjudication_id: canonical.dodCioAdjudicationId,
    esp_inheritance: canonical.espInheritance,
  };
}

/**
 * Compute the canonical fields for a control. Layered signal:
 *
 *   1. Operator-driven elevators stick across rescores: if the prior
 *      snapshot pointed at an enduring exception, ESP inheritance, or
 *      DoD CIO adjudication, preserve them (operator intent).
 *   2. operator-declared not_applicable from prior snapshot sticks.
 *   3. Legacy control_records.implementation_status is treated as
 *      evidence per AG p.10 (which accepts specifications/mechanisms/
 *      activities/individuals — not just register entries):
 *        legacy='inherited'          → MET via esp_inheritance
 *        legacy='not_applicable'     → NA via not_applicable
 *        legacy='implemented'/'assessed' → MET via evidence
 *        legacy='in_progress'        → NOT_MET (operator-set "not done
 *                                       yet" intent must be respected)
 *        legacy='not_started' / null → fall through to CAE rollup
 *   4. CAE rollup as fallback:
 *        satisfies / at_risk → MET via evidence
 *        partial / gap        → NOT_MET via not_met
 *   5. Operational-plan elevator: if NOT_MET on raw evidence but an
 *      AG-compliant non-chronic-slipped POA&M exists → MET via
 *      operational_plan_of_action.
 *   6. RA.L2-3.11.1 — MET via evidence additionally requires a finalized
 *      risk_assessments envelope within the declared frequency (see
 *      evaluateRa311LifecycleGate). Elevators from (1) and (5) are
 *      unaffected.
 *
 * Per-objective verdicts: every objective inherits the requirement-
 * level finding (Phase A2 coarse seed, refined by future per-objective
 * scorers). The objective letters come from the prior snapshot, which
 * in turn came from the assessment-guide catalog.
 */
async function projectCanonical(
  orgId: string,
  controlId: string,
  rollup: AdjudicationStatus,
  ra311Gate: Ra311LifecycleGateResult | null,
): Promise<{
  aggregateFinding: AggregateFinding;
  metVia: MetVia;
  objectiveVerdicts: ObjectiveVerdict[];
  enduringExceptionId: string | null;
  operationalPlanPoamId: string | null;
  dodCioAdjudicationId: string | null;
  espInheritance: Record<string, unknown> | null;
}> {
  // Pull the prior snapshot for operator-driven-elevator continuity.
  const [prior] = await db
    .select({
      metVia: controlAdjudicationSnapshots.metVia,
      enduringExceptionId: controlAdjudicationSnapshots.enduringExceptionId,
      dodCioAdjudicationId: controlAdjudicationSnapshots.dodCioAdjudicationId,
      espInheritance: controlAdjudicationSnapshots.espInheritance,
      objectiveVerdicts: controlAdjudicationSnapshots.objectiveVerdicts,
    })
    .from(controlAdjudicationSnapshots)
    .where(
      and(
        eq(controlAdjudicationSnapshots.organizationId, orgId),
        eq(controlAdjudicationSnapshots.controlId, controlId),
      ),
    )
    .orderBy(desc(controlAdjudicationSnapshots.computedAt))
    .limit(1);

  const priorObjectives = (prior?.objectiveVerdicts as
    | ObjectiveVerdict[]
    | null) ?? [];

  // 1. Operator-driven elevators stick.
  if (prior) {
    if (prior.metVia === "esp_inheritance" && prior.espInheritance) {
      return {
        aggregateFinding: "MET",
        metVia: "esp_inheritance",
        objectiveVerdicts: priorObjectives.map((o) => ({ ...o, verdict: "MET" })),
        enduringExceptionId: null,
        operationalPlanPoamId: null,
        dodCioAdjudicationId: null,
        espInheritance: prior.espInheritance as Record<string, unknown>,
      };
    }
    if (prior.metVia === "enduring_exception" && prior.enduringExceptionId) {
      return {
        aggregateFinding: "MET",
        metVia: "enduring_exception",
        objectiveVerdicts: priorObjectives.map((o) => ({ ...o, verdict: "MET" })),
        enduringExceptionId: prior.enduringExceptionId,
        operationalPlanPoamId: null,
        dodCioAdjudicationId: null,
        espInheritance: null,
      };
    }
    if (prior.metVia === "dod_cio_adjudication" && prior.dodCioAdjudicationId) {
      return {
        aggregateFinding: "MET",
        metVia: "dod_cio_adjudication",
        objectiveVerdicts: priorObjectives.map((o) => ({ ...o, verdict: "MET" })),
        enduringExceptionId: null,
        operationalPlanPoamId: null,
        dodCioAdjudicationId: prior.dodCioAdjudicationId,
        espInheritance: null,
      };
    }
    if (prior.metVia === "not_applicable") {
      return {
        aggregateFinding: "NA",
        metVia: "not_applicable",
        objectiveVerdicts: priorObjectives.map((o) => ({ ...o, verdict: "NA" })),
        enduringExceptionId: null,
        operationalPlanPoamId: null,
        dodCioAdjudicationId: null,
        espInheritance: null,
      };
    }
  }

  // 2. Legacy implementation_status as evidence signal.
  const [legacy] = await db
    .select({
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        eq(controlRecords.controlId, controlId),
      ),
    )
    .limit(1);

  let aggregateFinding: AggregateFinding;
  let metVia: MetVia;
  switch (legacy?.implementationStatus) {
    case "inherited":
      aggregateFinding = "MET";
      metVia = "esp_inheritance";
      break;
    case "not_applicable":
      aggregateFinding = "NA";
      metVia = "not_applicable";
      break;
    case "implemented":
    case "assessed":
      aggregateFinding = "MET";
      metVia = "evidence";
      break;
    case "in_progress":
      // Operator explicitly set in_progress — that's a "not done yet"
      // declaration the canonical helper must respect. The CAE rollup
      // can be coarse here (counting adjacent register evidence), so
      // we DON'T silently flip to MET on satisfies/at_risk.
      aggregateFinding = "NOT_MET";
      metVia = "not_met";
      break;
    case "not_started":
    default:
      // No operator opinion. Fall through to CAE rollup.
      if (rollup === "satisfies" || rollup === "at_risk") {
        aggregateFinding = "MET";
        metVia = "evidence";
      } else {
        aggregateFinding = "NOT_MET";
        metVia = "not_met";
      }
      break;
  }

  // 3. Operational-plan elevator: if the requirement is NOT_MET on
  // raw evidence + legacy, but an active, AG-compliant, non-chronic-
  // slipped POA&M exists, elevate to MET via operational_plan_of_action.
  let operationalPlanPoamId: string | null = null;
  if (aggregateFinding === "NOT_MET") {
    const [cr] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId),
        ),
      )
      .limit(1);
    if (cr) {
      const candidates = await db
        .select()
        .from(poamEntries)
        .where(
          and(
            eq(poamEntries.controlRecordId, cr.id),
            sql`${poamEntries.status}::text IN ('active', 'open')`,
          ),
        );
      for (const p of candidates) {
        const verdict = await canPoamElevate(p);
        if (verdict.canElevate) {
          aggregateFinding = "MET";
          metVia = "operational_plan_of_action";
          operationalPlanPoamId = p.id;
          break;
        }
      }
    }
  }

  // 4. RA.L2-3.11.1 lifecycle gate — clamps MET via evidence only.
  if (
    controlId === "3.11.1" &&
    ra311Gate &&
    !ra311Gate.satisfied &&
    aggregateFinding === "MET" &&
    metVia === "evidence"
  ) {
    aggregateFinding = "NOT_MET";
    metVia = "not_met";
  }

  // 5. Per-objective seed: every objective inherits the requirement-
  // level finding. Phase A2 backfilled the objective letters from the
  // assessment guide; future per-objective scorers will refine the
  // verdict per letter from real evidence.
  const objectiveVerdicts: ObjectiveVerdict[] = priorObjectives.map((o) => ({
    ...o,
    verdict: aggregateFinding,
  }));

  return {
    aggregateFinding,
    metVia,
    objectiveVerdicts,
    enduringExceptionId: null,
    operationalPlanPoamId,
    dodCioAdjudicationId: null,
    espInheritance: null,
  };
}

/**
 * Persist the verdict to control_adjudication_snapshots. Idempotent on
 * (org, control, manifest_id) — re-scoring the same manifest replaces.
 * Manual scores (no manifest_id) collide on the literal "__manual__"
 * key so a manual rescore replaces the prior manual snapshot.
 */
export async function persistAdjudication(
  ctx: ScoreContext,
  result: ControlAdjudication,
): Promise<void> {
  const manifestKey = result.most_recent_manifest_id ?? null;

  // Idempotency lookup — match the unique index expression
  // COALESCE(period_basis_manifest_id, '__manual__').
  const [existing] = await db
    .select({ id: controlAdjudicationSnapshots.id })
    .from(controlAdjudicationSnapshots)
    .where(
      and(
        eq(controlAdjudicationSnapshots.organizationId, ctx.orgId),
        eq(controlAdjudicationSnapshots.controlId, result.control_id),
        manifestKey === null
          ? sql`${controlAdjudicationSnapshots.periodBasisManifestId} IS NULL`
          : eq(
              controlAdjudicationSnapshots.periodBasisManifestId,
              manifestKey,
            ),
      ),
    )
    .limit(1);

  // Single atomic write of the rollup AND the canonical fields. Phase
  // B's rescore-trigger used to follow a successful persistAdjudication
  // with a separate UPDATE that overwrote met_via / aggregate_finding /
  // objective_verdicts; that two-write window is gone now — scoreControl
  // produces canonical output directly and persistAdjudication writes
  // every column in one statement.
  const canonicalSet = {
    computedAt: result.computed_at,
    status: result.status,
    confidence: result.confidence,
    requirementsJson: result.requirements as unknown as Record<string, unknown>[],
    aggregateFinding: result.aggregate_finding,
    metVia: result.met_via,
    objectiveVerdicts: result.objective_verdicts as unknown as Record<string, unknown>[],
    enduringExceptionId: result.enduring_exception_id,
    operationalPlanPoamId: result.operational_plan_poam_id,
    dodCioAdjudicationId: result.dod_cio_adjudication_id,
    espInheritance: result.esp_inheritance as unknown as Record<string, unknown> | null,
  } as const;

  if (existing) {
    await db
      .update(controlAdjudicationSnapshots)
      .set(canonicalSet)
      .where(eq(controlAdjudicationSnapshots.id, existing.id));
  } else {
    await db.insert(controlAdjudicationSnapshots).values({
      organizationId: ctx.orgId,
      controlId: result.control_id,
      periodBasisManifestId: manifestKey,
      ...canonicalSet,
    });
  }
}

/**
 * Convenience: score and persist all controls. Used by the dispatcher
 * hook on every ingest.
 */
export async function scoreAndPersistAll(
  ctx: ScoreContext,
): Promise<ControlAdjudication[]> {
  const logic = getControlAssessmentLogic();
  const results: ControlAdjudication[] = [];
  for (const control of logic.controls) {
    if (control.register_requirements.length === 0) continue;
    const result = await scoreControl(ctx, control.control_id);
    if (result) {
      await persistAdjudication(ctx, result);
      results.push(result);
    }
  }
  return results;
}

/**
 * Read the latest snapshot for a control. UI read path for the per-control
 * detail page + auditor view.
 */
export async function getLatestAdjudication(
  orgId: string,
  controlId: string,
): Promise<typeof controlAdjudicationSnapshots.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(controlAdjudicationSnapshots)
    .where(
      and(
        eq(controlAdjudicationSnapshots.organizationId, orgId),
        eq(controlAdjudicationSnapshots.controlId, controlId),
      ),
    )
    .orderBy(desc(controlAdjudicationSnapshots.computedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Read the latest snapshot for ALL controls in one query. Used by the
 * /dashboard/cae overview page and the /auditor index.
 */
export async function getLatestAdjudicationsForOrg(
  orgId: string,
): Promise<Map<string, typeof controlAdjudicationSnapshots.$inferSelect>> {
  // SELECT DISTINCT ON (control_id) ... ORDER BY control_id, computed_at DESC
  // is the cleanest, but Drizzle doesn't expose distinctOn for postgres
  // succinctly. Use a window-function CTE-equivalent expressed as a sub-
  // query against MAX(computed_at).
  const rows = await db
    .select()
    .from(controlAdjudicationSnapshots)
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId))
    .orderBy(desc(controlAdjudicationSnapshots.computedAt));

  const out = new Map<
    string,
    typeof controlAdjudicationSnapshots.$inferSelect
  >();
  for (const row of rows) {
    if (!out.has(row.controlId)) out.set(row.controlId, row);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// internals
// ─────────────────────────────────────────────────────────────────────

async function scoreRequirement(
  orgId: string,
  requirement: ControlAssessmentControl["register_requirements"][number],
  sinceUtc: Date,
  nowUtc: Date,
): Promise<RequirementResult> {
  const candidates = resolveRegisterKeyCandidates(requirement.register_id);
  const matching = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matching.length === 0) {
    return {
      register_key: requirement.register_id,
      required_min: requirement.min_final_entries,
      observed_final: 0,
      observed_isso_verified: 0,
      cadence_days_required: requirement.cadence_days,
      cadence_days_actual: null,
      satisfied: false,
      evidence_entry_ids: [],
      gap_reason: "register not provisioned for organization",
    };
  }

  const registerIds = matching.map((m) => m.id);

  const rows = await db
    .select({
      id: governanceRegisterEntries.id,
      status: governanceRegisterEntries.status,
      finalizedAt: governanceRegisterEntries.finalizedAt,
      updatedAt: governanceRegisterEntries.updatedAt,
      createdAt: governanceRegisterEntries.createdAt,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        sql`${governanceRegisterEntries.registerId} IN (${sql.join(
          registerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        gte(governanceRegisterEntries.createdAt, sinceUtc),
      ),
    )
    .orderBy(desc(governanceRegisterEntries.createdAt))
    .limit(500);

  let observedFinal = 0;
  let observedIssoVerified = 0;
  let mostRecentSigned: Date | null = null;
  const evidenceIds: string[] = [];

  for (const row of rows) {
    const data = (row.entryData ?? null) as Record<string, unknown> | null;
    const lifecycle =
      (data?.lifecycle_state as string | undefined) ??
      (row.status === "draft" ? "draft" : "auto_recorded");

    if (row.status === "final") observedFinal++;
    if (lifecycle === "isso_verified") observedIssoVerified++;

    if (
      lifecycle === "isso_verified" ||
      lifecycle === "admin_signed" ||
      lifecycle === "auto_recorded"
    ) {
      const ts = row.finalizedAt ?? row.updatedAt ?? row.createdAt;
      if (ts && (!mostRecentSigned || ts > mostRecentSigned))
        mostRecentSigned = ts;
    }

    if (evidenceIds.length < 5) evidenceIds.push(row.id);
  }

  const cadenceActual =
    mostRecentSigned !== null
      ? Math.round(
          (nowUtc.getTime() - mostRecentSigned.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

  const satisfiedByCount = observedFinal >= requirement.min_final_entries;
  // cadence_days = 0 means "event-driven, no time bound" — always satisfied.
  const satisfiedByCadence =
    requirement.cadence_days === 0 ||
    (cadenceActual !== null && cadenceActual <= requirement.cadence_days);

  const satisfied = satisfiedByCount && satisfiedByCadence;
  let gapReason: string | undefined;
  if (!satisfiedByCount) {
    gapReason = `observed ${observedFinal} final entries; requires ${requirement.min_final_entries}`;
  } else if (!satisfiedByCadence) {
    gapReason = cadenceActual === null
      ? `no signed evidence found in lookback window (cadence requirement: ${requirement.cadence_days}d)`
      : `most recent signed evidence is ${cadenceActual}d old (cadence requirement: ${requirement.cadence_days}d)`;
  }

  return {
    register_key: requirement.register_id,
    required_min: requirement.min_final_entries,
    observed_final: observedFinal,
    observed_isso_verified: observedIssoVerified,
    cadence_days_required: requirement.cadence_days,
    cadence_days_actual: cadenceActual,
    satisfied,
    evidence_entry_ids: evidenceIds,
    gap_reason: gapReason,
  };
}

/**
 * Evaluate one CAE register requirement with the same counting + cadence
 * rules as scoreControl (defaults to the same 90-day entry lookback).
 * calculateControlStatus uses this so implementationStatus cannot reach
 * implemented while Phase 7 register evidence would fail.
 */
export async function evaluateRegisterRequirementEvidence(
  orgId: string,
  requirement: ControlAssessmentControl["register_requirements"][number],
  nowUtc: Date,
  lookbackDays = 90,
): Promise<RequirementResult> {
  const since = new Date(nowUtc.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return scoreRequirement(orgId, requirement, since, nowUtc);
}

function mapStatus(
  control: ControlAssessmentControl,
  requirements: RequirementResult[],
  _nowUtc: Date,
): AdjudicationStatus {
  // Controls with no register_requirements have no operational evidence
  // gating — the scoring engine reports gap so the UI shows "n/a, manual
  // attestation track."
  if (requirements.length === 0) return "gap";

  const satisfiedCount = requirements.filter((r) => r.satisfied).length;
  if (satisfiedCount === 0) return "gap";

  if (satisfiedCount < requirements.length) return "partial";

  // All satisfied — check for at_risk: any requirement within 25% of cadence
  // expiry (e.g., 90-day cadence with 68+ days since last evidence).
  const atRisk = requirements.some((r) => {
    if (r.cadence_days_required === 0) return false;
    if (r.cadence_days_actual === null) return false;
    return (
      r.cadence_days_actual >= r.cadence_days_required * 0.75 &&
      r.cadence_days_actual <= r.cadence_days_required
    );
  });
  return atRisk ? "at_risk" : "satisfies";
}

function computeConfidence(
  control: ControlAssessmentControl,
  requirements: RequirementResult[],
  status: AdjudicationStatus,
): number {
  if (requirements.length === 0) return 0;

  let conf = 0;

  // +0.4 every requirement satisfied
  if (requirements.every((r) => r.satisfied)) conf += 0.4;
  else if (requirements.some((r) => r.satisfied)) {
    conf += 0.4 * (requirements.filter((r) => r.satisfied).length / requirements.length);
  }

  // +0.2 every requirement has at least one isso_verified entry
  if (requirements.every((r) => r.observed_isso_verified > 0)) conf += 0.2;
  else if (requirements.some((r) => r.observed_isso_verified > 0)) {
    conf +=
      0.2 *
      (requirements.filter((r) => r.observed_isso_verified > 0).length /
        requirements.length);
  }

  // +0.2 every requirement has cadence_actual within 50% of cadence_days
  const freshRequirements = requirements.filter((r) => {
    if (r.cadence_days_required === 0) return true;
    if (r.cadence_days_actual === null) return false;
    return r.cadence_days_actual <= r.cadence_days_required * 0.5;
  });
  if (freshRequirements.length === requirements.length) conf += 0.2;
  else conf += 0.2 * (freshRequirements.length / requirements.length);

  // +0.1 evidence volume above 2x min_final_entries floor (deep coverage)
  const overObserved = requirements.filter(
    (r) => r.observed_final >= 2 * Math.max(r.required_min, 1),
  );
  if (overObserved.length === requirements.length) conf += 0.1;
  else conf += 0.1 * (overObserved.length / requirements.length);

  // +0.1 status calibration penalty/bonus
  if (status === "satisfies") conf += 0.1;
  else if (status === "at_risk") conf += 0.05;
  else if (status === "partial") conf -= 0.05;
  else conf -= 0.1;

  return Math.max(0, Math.min(1, Number(conf.toFixed(3))));
}
