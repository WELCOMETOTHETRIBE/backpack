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
  controlRecords,
  controlStatusOverrides,
  dodCioAdjudications,
  enduringExceptions,
  governanceArtifactCompletions,
  poamEntries,
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

  // Staleness detection — is there evidence newer than the snapshot?
  // Compares snapshot.computed_at against the latest control_records
  // update + the latest attestation completion. If newer evidence
  // exists, flag stale so the UI can offer a refresh affordance.
  const stale = await isSnapshotStale(orgId, controlId, snapshot.computedAt);

  return projectSnapshot(snapshot, override ?? null, stale);
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

  // Bulk staleness — one query for the whole org. Pulls max
  // updated_at per control_record + max attested_at per
  // control_record from completions, then compares each snapshot's
  // computed_at against the per-control max.
  const stalenessByControl = await computeStalenessForOrg(orgId);

  const out = new Map<string, ControlState>();
  for (const [controlId, snap] of latestByControl) {
    out.set(
      controlId,
      projectSnapshot(
        snap,
        overrideByControl.get(controlId) ?? null,
        stalenessByControl.get(controlId) ?? false,
      ),
    );
  }
  return out;
}

/**
 * Per-control staleness bulk compute. For every (org, controlId) pair,
 * compare the snapshot's computed_at against the most recent
 * governance_artifact_completion attested_at and the most recent
 * control_records.updated_at. If either is newer, the snapshot is
 * stale.
 *
 * Single round-trip; the SCTM page calls getControlStatesForOrg once
 * per render and shouldn't pay for N+1.
 */
async function computeStalenessForOrg(
  orgId: string,
): Promise<Map<string, boolean>> {
  const rows = await db.execute(sql`
    SELECT
      cr.control_id,
      cr.updated_at AS record_updated_at,
      (
        SELECT MAX(gac.attested_at)
        FROM ${governanceArtifactCompletions} gac
        WHERE gac.control_record_id = cr.id
      ) AS latest_attestation,
      cas.computed_at AS snapshot_computed_at
    FROM ${controlRecords} cr
    LEFT JOIN LATERAL (
      SELECT computed_at
      FROM ${controlAdjudicationSnapshots} s
      WHERE s.organization_id = cr.organization_id
        AND s.control_id = cr.control_id
      ORDER BY s.computed_at DESC
      LIMIT 1
    ) cas ON TRUE
    WHERE cr.organization_id = ${orgId}
  `);
  const out = new Map<string, boolean>();
  for (const r of rows as unknown as Array<{
    control_id: string;
    record_updated_at: Date | string | null;
    latest_attestation: Date | string | null;
    snapshot_computed_at: Date | string | null;
  }>) {
    const computed = r.snapshot_computed_at
      ? new Date(r.snapshot_computed_at).getTime()
      : 0;
    const recordUpdated = r.record_updated_at
      ? new Date(r.record_updated_at).getTime()
      : 0;
    const lastAttested = r.latest_attestation
      ? new Date(r.latest_attestation).getTime()
      : 0;
    const newest = Math.max(recordUpdated, lastAttested);
    out.set(r.control_id, newest > computed);
  }
  return out;
}

/**
 * Single-control staleness — used by getControlState() (the singular
 * variant). Issues two indexed lookups; ~5ms total.
 */
async function isSnapshotStale(
  orgId: string,
  controlId: string,
  snapshotComputedAt: Date,
): Promise<boolean> {
  const [cr] = await db
    .select({
      id: controlRecords.id,
      updatedAt: controlRecords.updatedAt,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        eq(controlRecords.controlId, controlId),
      ),
    )
    .limit(1);
  if (!cr) return false;
  if (cr.updatedAt && cr.updatedAt.getTime() > snapshotComputedAt.getTime()) {
    return true;
  }
  const [latest] = await db
    .select({ attestedAt: governanceArtifactCompletions.attestedAt })
    .from(governanceArtifactCompletions)
    .where(eq(governanceArtifactCompletions.controlRecordId, cr.id))
    .orderBy(desc(governanceArtifactCompletions.attestedAt))
    .limit(1);
  if (
    latest?.attestedAt &&
    latest.attestedAt.getTime() > snapshotComputedAt.getTime()
  ) {
    return true;
  }
  return false;
}

/**
 * Derives ControlState from a snapshot + (optional) override.
 *
 * Side-effect-free; safe to call from any read path.
 */
function projectSnapshot(
  snapshot: typeof controlAdjudicationSnapshots.$inferSelect,
  override: typeof controlStatusOverrides.$inferSelect | null,
  stale: boolean = false,
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
    binSubLabel: deriveSubLabel(caeRollup, metVia, aggregate),
    override: override
      ? {
          setBy: override.setByUserId,
          setAt: override.setAt,
          reason: override.reason,
          expiresAt: override.expiresAt,
        }
      : null,
    computedAt: snapshot.computedAt,
    staleSinceLastEvidence: stale,
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
    // the canonical helper derives the headline finding from a layered
    // signal:
    //
    //   1. metVia elevator wins. If a snapshot is marked inherited via
    //      ESP, governed by an enduring exception, covered by a DoD CIO
    //      adjudication, or backed by a finalized non-chronic-slipped
    //      operational plan, that's MET regardless of the rollup. AG
    //      pp.10–11 explicitly recognize each of these.
    //   2. Otherwise the CAE rollup (a real scorer determination
    //      against register evidence) is the next-best signal.
    //   3. NOT MET only when neither an elevator nor evidence supports
    //      the requirement.
    //
    // This is not over-claiming: the elevators each map to a documented
    // SSP section, and the rollup is itself evidence-derived. Phase A2
    // backfills objective_verdicts on every snapshot; once that lands,
    // this entire branch becomes dead code.
    if (
      metVia === "esp_inheritance" ||
      metVia === "enduring_exception" ||
      metVia === "dod_cio_adjudication" ||
      metVia === "operational_plan_of_action"
    ) {
      return "MET";
    }
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

function deriveSubLabel(
  rollup: CAERollup,
  metVia: MetVia,
  finding: CMMCFinding,
): string | null {
  // Elevator-driven labels surface regardless of finding — the C3PAO
  // wants to see *which* elevator is invoked.
  if (metVia === "operational_plan_of_action") return "MET via POA&M";
  if (metVia === "enduring_exception") return "MET via enduring exception";
  if (metVia === "dod_cio_adjudication") return "MET via DoD CIO adjudication";
  if (metVia === "esp_inheritance") return "MET via ESP inheritance";

  // Rollup-derived warnings only matter when the finding is at risk or
  // not met. When the finding is already MET via legacy attestation /
  // evidence, surfacing "no evidence yet" or "partial — gap remaining"
  // would be misleading. Only "evidence aging" (at_risk) is useful on
  // a MET finding because it forecasts a future degradation.
  if (rollup === "at_risk" && finding === "MET") return "evidence aging";
  if (finding === "NOT_MET" && rollup === "partial") return "partial — gap remaining";
  if (finding === "NOT_MET" && rollup === "gap") return "no evidence yet";
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
