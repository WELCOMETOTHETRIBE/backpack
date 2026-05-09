/**
 * scoreControlsAffectedBy — the canonical rescore trigger.
 *
 * Called by every write path that could change a control's adjudication
 * (attestation sign, register-entry finalize, RA finalize, POA&M
 * finalize, manual override, IR bundle archive, QMS manifest ingest,
 * ISSO export ingest, validator run persisted). The helper:
 *
 *   1. Resolves which controls to rescore (explicit hint or "all").
 *   2. Calls the existing scoreControl() for each (Phase 7 engine).
 *   3. Persists the snapshot via persistAdjudication() — but routed
 *      through this helper so we can layer the AG-aligned bits the
 *      Phase 7 engine doesn't know about:
 *         - met_via projection (esp_inheritance / enduring_exception /
 *           operational_plan_of_action / dod_cio_adjudication / evidence
 *           / not_met / not_applicable)
 *         - aggregate_finding (MET / NOT_MET / NA at requirement level)
 *         - auto-POA&M-on-NOT-MET (via ensureDraftPoamForNotMet)
 *         - control_adjudication_history row capturing prior→new
 *           transition with trigger_source label
 *   4. For controls whose elevator is operational_plan_of_action,
 *      checks canPoamElevate() — if the POA&M is no longer eligible
 *      (closed, draft, chronic-slipped, missing AG fields), reverts
 *      met_via to 'evidence' and lets the rollup determine the
 *      finding.
 *
 * Phase B's eight write paths each call this helper at the end of
 * their transaction (best-effort; the helper swallows errors so a
 * scoring failure doesn't roll back evidence writes).
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationHistory,
  controlAdjudicationSnapshots,
  controlRecords,
  controls,
  poamEntries,
} from "@/db/schema";
import {
  persistAdjudication,
  scoreControl,
  type ControlAdjudication,
} from "@/lib/evidence-engine/adjudication/scorer";

import {
  canPoamElevate,
  ensureDraftPoamForNotMet,
  isPoamChronicallySlipped,
} from "./auto-poam";

export type TriggerSource =
  | "attestation_signed"
  | "attestation_revoked"
  | "register_entry_finalized"
  | "register_entry_voided"
  | "ra_finalized"
  | "ra_acceptance_recorded"
  | "ra_poam_linked"
  | "poam_created"
  | "poam_finalized"
  | "poam_milestone_completed"
  | "poam_target_pushed"
  | "poam_closed"
  | "manual_override"
  | "ir_bundle_archived"
  | "qms_manifest_ingested"
  | "isso_export_ingested"
  | "validator_run_persisted"
  | "on_read_stale_recompute"
  | "phase_b_full_rescore";

export interface RescoreInput {
  organizationId: string;
  triggerSource: TriggerSource;
  /**
   * If provided, only these controls are rescored. Empty / undefined
   * means "every control" — used by ISSO export ingest, QMS manifest
   * ingest, and the manual full rescore.
   */
  controlIds?: string[];
  triggeredByUserId?: string | null;
}

export interface RescoreResult {
  rescored: number;
  metFlipsToNotMet: number;
  notMetFlipsToMet: number;
  draftPoamsCreated: number;
  poamElevatorsRevoked: number;
  errored: number;
}

/**
 * Recompute the snapshot for the given controls and project the
 * canonical fields (met_via, aggregate_finding) on top.
 *
 * Best-effort: if scoring throws for one control, the remaining
 * controls still get rescored. The helper never throws — callers
 * should not retry on failure.
 */
export async function scoreControlsAffectedBy(
  input: RescoreInput,
): Promise<RescoreResult> {
  const result: RescoreResult = {
    rescored: 0,
    metFlipsToNotMet: 0,
    notMetFlipsToMet: 0,
    draftPoamsCreated: 0,
    poamElevatorsRevoked: 0,
    errored: 0,
  };

  // Resolve the control set.
  const controlSet =
    input.controlIds && input.controlIds.length > 0
      ? input.controlIds
      : (
          await db
            .select({ controlId: controlRecords.controlId })
            .from(controlRecords)
            .where(eq(controlRecords.organizationId, input.organizationId))
        ).map((r) => r.controlId);

  // Pull existing snapshots for prior-state diffing.
  const priorMap = new Map<
    string,
    typeof controlAdjudicationSnapshots.$inferSelect
  >();
  if (controlSet.length > 0) {
    const priorRows = await db
      .select()
      .from(controlAdjudicationSnapshots)
      .where(
        and(
          eq(controlAdjudicationSnapshots.organizationId, input.organizationId),
          sql`${controlAdjudicationSnapshots.controlId} IN (${sql.join(
            controlSet.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        ),
      );
    for (const r of priorRows) priorMap.set(r.controlId, r);
  }

  // Pull control titles for nicer auto-POA&M weakness_description text.
  const titles = controlSet.length > 0
    ? await db
        .select({ controlId: controls.controlId, title: controls.title })
        .from(controls)
        .where(
          sql`${controls.controlId} IN (${sql.join(
            controlSet.map((c) => sql`${c}`),
            sql`, `,
          )})`,
        )
    : [];
  const titleMap = new Map(titles.map((t) => [t.controlId, t.title] as const));

  for (const cid of controlSet) {
    try {
      const adj = await scoreControl(
        { orgId: input.organizationId },
        cid,
      );
      if (!adj) {
        // Control isn't in control_assessment_logic.v1.json (no
        // register requirements). Skip — the canonical helper handles
        // missing snapshots gracefully.
        continue;
      }

      const prior = priorMap.get(cid);
      const projected = await projectCanonicalFields(
        input.organizationId,
        adj,
        prior,
      );

      // Persist the Phase 7 snapshot via the existing helper (rollup +
      // confidence + requirementsJson). Then layer our canonical
      // fields directly via UPDATE so we don't have to rewrite the
      // existing persistAdjudication.
      await persistAdjudication({ orgId: input.organizationId }, adj);

      // Reload to get the freshly-written row's id, then patch the
      // canonical fields onto it.
      const [snap] = await db
        .select({ id: controlAdjudicationSnapshots.id })
        .from(controlAdjudicationSnapshots)
        .where(
          and(
            eq(
              controlAdjudicationSnapshots.organizationId,
              input.organizationId,
            ),
            eq(controlAdjudicationSnapshots.controlId, cid),
          ),
        )
        .orderBy(sql`${controlAdjudicationSnapshots.computedAt} DESC`)
        .limit(1);

      if (snap) {
        await db
          .update(controlAdjudicationSnapshots)
          .set({
            metVia: projected.metVia,
            aggregateFinding: projected.aggregateFinding,
            objectiveVerdicts: projected.objectiveVerdicts,
            operationalPlanPoamId: projected.operationalPlanPoamId,
            enduringExceptionId: projected.enduringExceptionId,
            dodCioAdjudicationId: projected.dodCioAdjudicationId,
            espInheritance: projected.espInheritance,
          })
          .where(eq(controlAdjudicationSnapshots.id, snap.id));

        // Auto-POA&M on NOT MET (per customer's "outstanding → POA&M"
        // rule). Idempotent — if any open POA&M already exists, no-op.
        if (projected.aggregateFinding === "NOT_MET") {
          const r = await ensureDraftPoamForNotMet({
            organizationId: input.organizationId,
            controlId: cid,
            controlTitle: titleMap.get(cid) ?? null,
          });
          if (r.created) result.draftPoamsCreated++;
        }

        // Track flips for the result tally.
        if (
          prior?.aggregateFinding === "MET" &&
          projected.aggregateFinding === "NOT_MET"
        ) {
          result.metFlipsToNotMet++;
        } else if (
          prior?.aggregateFinding === "NOT_MET" &&
          projected.aggregateFinding === "MET"
        ) {
          result.notMetFlipsToMet++;
        }
        if (
          prior?.metVia === "operational_plan_of_action" &&
          projected.metVia !== "operational_plan_of_action"
        ) {
          result.poamElevatorsRevoked++;
        }

        // History row — captures the prior→new transition with the
        // trigger source for the SSP audit trail.
        if (
          prior?.aggregateFinding !== projected.aggregateFinding ||
          prior?.metVia !== projected.metVia
        ) {
          await db.insert(controlAdjudicationHistory).values({
            organizationId: input.organizationId,
            controlId: cid,
            snapshotId: snap.id,
            priorAggregateFinding: prior?.aggregateFinding ?? null,
            newAggregateFinding: projected.aggregateFinding,
            priorMetVia: prior?.metVia ?? null,
            newMetVia: projected.metVia,
            priorObjectiveVerdicts:
              (prior?.objectiveVerdicts as unknown[]) ?? null,
            newObjectiveVerdicts: projected.objectiveVerdicts as unknown[],
            triggerSource: input.triggerSource,
            triggeredByUserId: input.triggeredByUserId ?? null,
          });
        }
      }

      result.rescored++;
    } catch (err) {
      result.errored++;
      console.error(
        `[scoreControlsAffectedBy] failed for control=${cid}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return result;
}

/**
 * Compute the canonical fields (met_via, aggregate_finding,
 * objective_verdicts, elevator pointers) from the Phase 7 scorer's
 * raw output. Honors:
 *
 *   - existing met_via=esp_inheritance / dod_cio_adjudication /
 *     enduring_exception (operator-driven elevators stick)
 *   - operational_plan_of_action elevator (active + AG-compliant +
 *     non-chronic-slipped POA&M)
 *   - operator-declared not_applicable (via prior snapshot's met_via)
 *   - Phase A2 per-objective seeding (every objective inherits the
 *     requirement-level finding for now; Phase B's deeper rescore
 *     refines this from real evidence)
 */
async function projectCanonicalFields(
  orgId: string,
  adj: ControlAdjudication,
  prior: typeof controlAdjudicationSnapshots.$inferSelect | undefined,
): Promise<{
  metVia: string;
  aggregateFinding: "MET" | "NOT_MET" | "NA";
  objectiveVerdicts: Array<{
    objective: string;
    verdict: "MET" | "NOT_MET" | "NA";
    evidence_ids: string[];
    rationale: string | null;
  }>;
  operationalPlanPoamId: string | null;
  enduringExceptionId: string | null;
  dodCioAdjudicationId: string | null;
  espInheritance: unknown;
}> {
  // 1. Operator-driven elevators stick: if a prior snapshot already
  // pointed at an enduring exception, ESP inheritance, or DoD CIO
  // adjudication, the rescore preserves them. Those are operator
  // intent, not scorer-derived. (Operator can revoke them via the
  // dedicated UI flows; this trigger doesn't unilaterally remove
  // them.)
  if (prior) {
    if (prior.metVia === "esp_inheritance" && prior.espInheritance) {
      return {
        metVia: "esp_inheritance",
        aggregateFinding: "MET",
        objectiveVerdicts: ((prior.objectiveVerdicts as Array<{
          objective: string;
          verdict: "MET" | "NOT_MET" | "NA";
          evidence_ids: string[];
          rationale: string | null;
        }>) ?? []),
        operationalPlanPoamId: null,
        enduringExceptionId: null,
        dodCioAdjudicationId: null,
        espInheritance: prior.espInheritance,
      };
    }
    if (prior.metVia === "enduring_exception" && prior.enduringExceptionId) {
      return {
        metVia: "enduring_exception",
        aggregateFinding: "MET",
        objectiveVerdicts: ((prior.objectiveVerdicts as Array<{
          objective: string;
          verdict: "MET" | "NOT_MET" | "NA";
          evidence_ids: string[];
          rationale: string | null;
        }>) ?? []),
        operationalPlanPoamId: null,
        enduringExceptionId: prior.enduringExceptionId,
        dodCioAdjudicationId: null,
        espInheritance: null,
      };
    }
    if (
      prior.metVia === "dod_cio_adjudication" &&
      prior.dodCioAdjudicationId
    ) {
      return {
        metVia: "dod_cio_adjudication",
        aggregateFinding: "MET",
        objectiveVerdicts: ((prior.objectiveVerdicts as Array<{
          objective: string;
          verdict: "MET" | "NOT_MET" | "NA";
          evidence_ids: string[];
          rationale: string | null;
        }>) ?? []),
        operationalPlanPoamId: null,
        enduringExceptionId: null,
        dodCioAdjudicationId: prior.dodCioAdjudicationId,
        espInheritance: null,
      };
    }
    if (prior.metVia === "not_applicable") {
      return {
        metVia: "not_applicable",
        aggregateFinding: "NA",
        objectiveVerdicts: ((prior.objectiveVerdicts as Array<{
          objective: string;
          verdict: "MET" | "NOT_MET" | "NA";
          evidence_ids: string[];
          rationale: string | null;
        }>) ?? []),
        operationalPlanPoamId: null,
        enduringExceptionId: null,
        dodCioAdjudicationId: null,
        espInheritance: null,
      };
    }
  }

  // 2. Determine the requirement-level finding from a layered signal:
  //
  //   a. Operator-set legacy implementation_status. Per AG p.10
  //      evidence includes specifications, mechanisms, activities, and
  //      individuals — not just register entries. A legacy 'implemented'
  //      marker reflects evidence the operator already determined exists
  //      (attestation, setup artifact, configuration baseline). The
  //      CAE scorer reads register entries only; if it returns 'gap'
  //      it just means no register evidence is in cadence, not that
  //      no evidence exists.
  //   b. CAE rollup. When legacy is in_progress/not_started, fall
  //      through to scorer-derived finding.
  //   c. Operational plan elevator (next step in the projection).
  //
  // This mirrors the Phase A0+ backfill rule so live rescore preserves
  // (rather than unwinds) the legacy-as-evidence projection.
  const [legacy] = await db
    .select({
      implementationStatus: controlRecords.implementationStatus,
      inheritedFrom: controlRecords.inheritedFrom,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        eq(controlRecords.controlId, adj.control_id),
      ),
    )
    .limit(1);

  let aggregateFinding: "MET" | "NOT_MET" | "NA";
  let metViaSeed: string;
  switch (legacy?.implementationStatus) {
    case "inherited":
      aggregateFinding = "MET";
      metViaSeed = "esp_inheritance";
      break;
    case "not_applicable":
      aggregateFinding = "NA";
      metViaSeed = "not_applicable";
      break;
    case "implemented":
    case "assessed":
      aggregateFinding = "MET";
      metViaSeed = "evidence";
      break;
    case "in_progress":
      // Operator explicitly set in_progress — that's an intentional
      // "not done yet" declaration the canonical helper must respect.
      // The CAE scorer can be too coarse here (e.g., counting adjacent
      // register evidence toward an unrelated procedural control), so
      // we DON'T silently flip to MET on satisfies/at_risk. NOT_MET
      // until the operator either:
      //   1. Lands real evidence and flips legacy to 'implemented'
      //   2. Activates an operational-plan POA&M (the elevator below
      //      can still flip the verdict on AG-compliant POA&Ms)
      aggregateFinding = "NOT_MET";
      metViaSeed = "not_met";
      break;
    case "not_started":
    default:
      // No operator opinion on file. Fall through to CAE rollup.
      // satisfies/at_risk → MET; partial/gap → NOT_MET.
      if (adj.status === "satisfies" || adj.status === "at_risk") {
        aggregateFinding = "MET";
        metViaSeed = "evidence";
      } else {
        aggregateFinding = "NOT_MET";
        metViaSeed = "not_met";
      }
      break;
  }

  // 3. Operational plan elevator: if the requirement is NOT_MET on
  // raw evidence but an active, non-chronic-slipped, AG-compliant
  // POA&M exists, elevate to MET via operational_plan_of_action.
  let metVia: string = metViaSeed;
  let operationalPlanPoamId: string | null = null;
  if (aggregateFinding === "NOT_MET") {
    const cr = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, adj.control_id),
        ),
      )
      .limit(1);
    if (cr[0]) {
      const candidates = await db
        .select()
        .from(poamEntries)
        .where(
          and(
            eq(poamEntries.controlRecordId, cr[0].id),
            sql`${poamEntries.status}::text IN ('active', 'open')`,
          ),
        );
      for (const p of candidates) {
        if (isPoamChronicallySlipped(p)) continue;
        const verdict = await canPoamElevate(p);
        if (verdict.canElevate) {
          metVia = "operational_plan_of_action";
          aggregateFinding = "MET";
          operationalPlanPoamId = p.id;
          break;
        }
      }
    }
  }

  // 4. Per-objective seed. Every objective inherits the requirement-
  // level finding (Phase A2 coarse seed). Phase B will refine this
  // by computing per-objective state from real evidence.
  const objectiveVerdicts = (
    (prior?.objectiveVerdicts as Array<{
      objective: string;
      verdict: "MET" | "NOT_MET" | "NA";
      evidence_ids: string[];
      rationale: string | null;
    }>) ?? []
  ).map((ov) => ({
    ...ov,
    verdict: aggregateFinding,
  }));

  return {
    metVia,
    aggregateFinding,
    objectiveVerdicts,
    operationalPlanPoamId,
    enduringExceptionId: null,
    dodCioAdjudicationId: null,
    espInheritance: null,
  };
}
