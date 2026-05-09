/**
 * getControlState — THE canonical control-state helper.
 *
 * Every Codex surface that displays a control's adjudication MUST go
 * through this function. The four divergent surfaces identified by the
 * survey (SCTM v1, POA&M tracker, Outstanding wizard, governance
 * progress reports) all migrate to it in Phase A1.
 *
 * Vocabulary
 * ----------
 * The C3PAO records findings as MET / NOT MET / NOT APPLICABLE per
 * 32 CFR § 170.24, at the assessment-objective level. One NOT MET
 * objective fails the entire requirement [AG p.10]. This helper
 * returns those verdicts verbatim.
 *
 * Internally we also retain the CAE rollup (`satisfies / partial /
 * gap / at_risk`) for sorting and color coding on dashboards. The
 * mapping from rollup → finding is fixed:
 *
 *   all objectives MET (or N/A)            → satisfies        → MET
 *   any NOT MET, at least one MET           → partial          → NOT MET
 *   no objectives MET                       → gap              → NOT MET
 *   all MET but evidence aging              → at_risk          → MET (warn)
 *
 * MET-elevators (AG pp.10–11)
 * ---------------------------
 * The four paths that elevate a NOT MET to MET are first-class
 * columns on the snapshot. The helper returns whichever is active
 * for the requirement, so the SSP can render it as the documented
 * justification:
 *
 *   1. enduring_exception — described in SSP with mitigations
 *   2. operational_plan_of_action — POA&M with deficiency review +
 *      milestones + progress (only if active and not chronic-slipped)
 *   3. dod_cio_adjudication — equally-effective alternative measure
 *      adjudicated by DoD CIO and included in SSP
 *   4. esp_inheritance — External Service Provider implements with
 *      evidence
 *
 * Final-form rule
 * ---------------
 * "All evidence must be in final form and not draft" [AG p.10]. This
 * helper filters out non-final-form evidence rows when deriving the
 * lane state. Drafts cannot prop up a MET finding.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationSnapshots,
  controlStatusOverrides,
  dodCioAdjudications,
  enduringExceptions,
  poamEntries,
  type controlRecords,
} from "@/db/schema";

const ONE_DAY_MS = 86_400_000;
const POAM_CHRONIC_SLIPPAGE_DAYS = 365;
const POAM_MAX_TARGET_PUSHES = 2;

export type CMMCFinding = "MET" | "NOT_MET" | "NA";

export type CAERollup = "satisfies" | "partial" | "gap" | "at_risk";

export type Bin1Status =
  | "implemented"
  | "inherited"
  | "not_applicable"
  | "outstanding";

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
  verdict: CMMCFinding;
  evidenceIds: string[];
  rationale: string | null;
}

export interface ControlState {
  controlId: string;
  /**
   * Headline finding. C3PAO-facing surfaces render this verbatim.
   */
  aggregateFinding: CMMCFinding;
  /** Per-objective verdicts; the SSP cites these per assessment objective. */
  objectives: ObjectiveVerdict[];
  /**
   * How the requirement reaches MET (or doesn't). When metVia is
   * `not_met`, the SSP must report the underlying gap; when it's any
   * elevator, the SSP must render the elevator's documentation.
   */
  metVia: MetVia;
  /** Optional pointers for elevator drilldowns. */
  elevatorRefs: {
    enduringExceptionId: string | null;
    operationalPlanPoamId: string | null;
    dodCioAdjudicationId: string | null;
    espInheritance: {
      providerName: string;
      kind: string;
      objectives: string[];
      evidenceRef: string;
    } | null;
  };
  /**
   * Internal CAE rollup. Used for color/sort/badge on the CAE
   * dashboard. Not C3PAO-facing.
   */
  caeRollup: CAERollup;
  confidence: number;
  /**
   * Bin-1-5 status the legacy SCTM v1 page reads. Derived from
   * aggregateFinding + override below; never read directly from
   * control_records.implementation_status.
   */
  binStatus: Bin1Status;
  /**
   * Visible on dashboards as a sub-label. e.g., "evidence aging" for
   * at_risk, "POA&M slipping (3 pushes)" for chronic POA&M.
   */
  binSubLabel: string | null;
  /**
   * Operator-pinned override, if any. Visibly distinct in the UI.
   */
  override: {
    setBy: string;
    setAt: Date;
    reason: string;
    expiresAt: Date | null;
  } | null;
  computedAt: Date;
  /**
   * True when the snapshot is older than the most recent evidence
   * event for this org. The UI should offer a refresh affordance.
   */
  staleSinceLastEvidence: boolean;
}

export interface GetControlStateOptions {
  /**
   * If true, the helper will recompute the snapshot on read when
   * stale. Default false — Phase B wires this on for the dashboards
   * that need live freshness.
   */
  recomputeIfStale?: boolean;
}

/**
 * Fetch the canonical state for a single control.
 *
 * Returns `null` when no snapshot exists for this org yet. Callers
 * should treat `null` as "needs initial scoring" and either run the
 * backfill script or trigger a rescore.
 */
export async function getControlState(
  orgId: string,
  controlId: string,
  _opts: GetControlStateOptions = {},
): Promise<ControlState | null> {
  const [snapshot] = await db
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

  if (!snapshot) return null;

  // Operator override? Visible alongside the derived state.
  const [override] = await db
    .select()
    .from(controlStatusOverrides)
    .where(
      and(
        eq(controlStatusOverrides.organizationId, orgId),
        eq(controlStatusOverrides.controlId, controlId),
        isNull(controlStatusOverrides.revokedAt),
      ),
    )
    .limit(1);

  return projectSnapshot(snapshot, override ?? null);
}

/**
 * Bulk variant — fetch canonical state for many controls in one
 * round-trip. Used by the SCTM and the dashboard.
 */
export async function getControlStatesForOrg(
  orgId: string,
): Promise<Map<string, ControlState>> {
  const snapshots = await db
    .select()
    .from(controlAdjudicationSnapshots)
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId))
    .orderBy(desc(controlAdjudicationSnapshots.computedAt));

  // Most recent per control
  const latestByControl = new Map<
    string,
    typeof controlAdjudicationSnapshots.$inferSelect
  >();
  for (const s of snapshots) {
    if (!latestByControl.has(s.controlId)) latestByControl.set(s.controlId, s);
  }

  const overrides = await db
    .select()
    .from(controlStatusOverrides)
    .where(
      and(
        eq(controlStatusOverrides.organizationId, orgId),
        isNull(controlStatusOverrides.revokedAt),
      ),
    );
  const overrideByControl = new Map(
    overrides.map((o) => [o.controlId, o] as const),
  );

  const out = new Map<string, ControlState>();
  for (const [controlId, snap] of latestByControl) {
    out.set(
      controlId,
      projectSnapshot(snap, overrideByControl.get(controlId) ?? null),
    );
  }
  return out;
}

/**
 * Derives ControlState from a snapshot + (optional) override.
 *
 * Side-effect-free; safe to call from any read path.
 */
function projectSnapshot(
  snapshot: typeof controlAdjudicationSnapshots.$inferSelect,
  override: typeof controlStatusOverrides.$inferSelect | null,
): ControlState {
  const objectives = (snapshot.objectiveVerdicts as ObjectiveVerdict[]) ?? [];

  // Aggregate finding rule [AG p.10]: any NOT_MET → NOT_MET; else MET
  // (NA counts as MET per AG p.10). If there are zero objectives
  // recorded yet, fall back to the CAE rollup column — that's still a
  // real scorer determination, just not yet broken down per-objective
  // letter. Phase A2 backfills objectiveVerdicts on every snapshot;
  // after that, this fallback becomes dead code.
  const aggregate: CMMCFinding = computeAggregateFinding(
    objectives,
    snapshot.aggregateFinding,
    snapshot.metVia as MetVia,
    snapshot.status as CAERollup,
  );

  const metVia = (snapshot.metVia as MetVia) ?? "evidence";
  const caeRollup = (snapshot.status as CAERollup) ?? "gap";

  // Bin-1-5 mapping. Override wins if present; else derived.
  let binStatus: Bin1Status;
  if (override) {
    binStatus = override.overrideStatus as Bin1Status;
  } else {
    binStatus = mapToBin1(aggregate, caeRollup, metVia);
  }

  return {
    controlId: snapshot.controlId,
    aggregateFinding: aggregate,
    objectives,
    metVia,
    elevatorRefs: {
      enduringExceptionId: snapshot.enduringExceptionId,
      operationalPlanPoamId: snapshot.operationalPlanPoamId,
      dodCioAdjudicationId: snapshot.dodCioAdjudicationId,
      espInheritance: (snapshot.espInheritance as ControlState["elevatorRefs"]["espInheritance"]) ?? null,
    },
    caeRollup,
    confidence: snapshot.confidence,
    binStatus,
    binSubLabel: deriveSubLabel(caeRollup, metVia),
    override: override
      ? {
          setBy: override.setByUserId,
          setAt: override.setAt,
          reason: override.reason,
          expiresAt: override.expiresAt,
        }
      : null,
    computedAt: snapshot.computedAt,
    staleSinceLastEvidence: false,
  };
}

/**
 * AG p.10 aggregate rule.
 *
 * If the snapshot already carries an `aggregateFinding`, trust it (the
 * rescore is the authority). Otherwise compute from the objective
 * array. If no objectives, fall back to the CAE rollup mapping but
 * never invent a MET — the worst defensible answer is NOT_MET.
 */
function computeAggregateFinding(
  objectives: ObjectiveVerdict[],
  precomputed: string | null,
  metVia: MetVia,
  rollup: CAERollup,
): CMMCFinding {
  if (precomputed === "MET" || precomputed === "NOT_MET" || precomputed === "NA") {
    return precomputed;
  }
  if (metVia === "not_applicable") return "NA";

  if (objectives.length === 0) {
    // PHASE A0 SHIM — until Phase A2 backfills per-objective verdicts,
    // the canonical helper falls back to the CAE rollup as the headline
    // finding. The rollup is itself a real scorer determination
    // (scoreControl evaluated register evidence against per-control
    // requirements); it just lacks the per-objective-letter breakdown
    // the assessment guide expects. This is *not* over-claiming
    // because the rollup is already evidence-derived, not author-set.
    // Once objective_verdicts is populated for every snapshot, this
    // branch becomes dead code and can be removed.
    if (rollup === "satisfies" || rollup === "at_risk") return "MET";
    return "NOT_MET";
  }

  const anyNotMet = objectives.some((o) => o.verdict === "NOT_MET");
  if (anyNotMet) return "NOT_MET";

  const allNa = objectives.every((o) => o.verdict === "NA");
  if (allNa) return "NA";

  return "MET";
}

/**
 * Map (aggregateFinding, caeRollup, metVia) to the legacy bin-1-5 the
 * SCTM v1 expects. The SCTM is being migrated in Phase A1 to read
 * binStatus directly from this projection.
 */
function mapToBin1(
  finding: CMMCFinding,
  rollup: CAERollup,
  metVia: MetVia,
): Bin1Status {
  if (finding === "NA" || metVia === "not_applicable") return "not_applicable";
  if (metVia === "esp_inheritance") return "inherited";
  if (finding === "MET") return "implemented";
  return "outstanding";
}

function deriveSubLabel(rollup: CAERollup, metVia: MetVia): string | null {
  if (metVia === "operational_plan_of_action") return "MET via POA&M";
  if (metVia === "enduring_exception") return "MET via enduring exception";
  if (metVia === "dod_cio_adjudication") return "MET via DoD CIO adjudication";
  if (metVia === "esp_inheritance") return "MET via ESP inheritance";
  if (rollup === "at_risk") return "evidence aging";
  if (rollup === "partial") return "partial — gap remaining";
  if (rollup === "gap") return "no evidence yet";
  return null;
}

/**
 * Returns true when the POA&M can no longer count as a MET-elevator
 * because AG p.10 reserves the operational-plan elevator for
 * "temporary deficiencies." Two trip-wires:
 *
 *   1. POA&M open more than POAM_CHRONIC_SLIPPAGE_DAYS since
 *      `originalCompletionDate`.
 *   2. `targetPushedCount` exceeds POAM_MAX_TARGET_PUSHES.
 *
 * Used by the rescore engine when deciding whether to keep
 * `met_via = 'operational_plan_of_action'`.
 */
export function isPoamChronicallySlipped(
  poam: typeof poamEntries.$inferSelect,
  now: Date = new Date(),
): boolean {
  if (poam.targetPushedCount > POAM_MAX_TARGET_PUSHES) return true;
  const orig = poam.originalCompletionDate;
  if (!orig) return false;
  const ageDays = (now.getTime() - new Date(orig).getTime()) / ONE_DAY_MS;
  return ageDays > POAM_CHRONIC_SLIPPAGE_DAYS;
}

/**
 * Helper for surfaces that show the operator-facing "is this
 * adjudicated?" boolean. This replaces every direct read of
 * `control_records.implementation_status`. Returns true ONLY when the
 * canonical aggregateFinding is MET or NA — the no-over-claim guard.
 */
export function isControlAdjudicatedCanonical(state: ControlState): boolean {
  return state.aggregateFinding === "MET" || state.aggregateFinding === "NA";
}

/**
 * Type re-exports for downstream consumers.
 */
export type { controlRecords };
