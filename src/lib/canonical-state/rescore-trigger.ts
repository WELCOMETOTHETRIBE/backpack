/**
 * scoreControlsAffectedBy — the canonical rescore trigger.
 *
 * Called by every write path that could change a control's adjudication
 * (attestation sign, register-entry finalize/void, RA finalize, POA&M
 * finalize/close/target-pushed, manual override, IR bundle archive,
 * QMS manifest ingest, ISSO export ingest, validator run persisted).
 *
 * Architecture: the CAE scorer
 * (src/lib/evidence-engine/adjudication/scorer.ts) is now the single
 * source of truth — scoreControl produces both the rollup
 * (satisfies/partial/gap/at_risk) AND the C3PAO-facing canonical
 * fields (aggregate_finding / met_via / objective_verdicts +
 * elevator pointers) in one pass. persistAdjudication writes every
 * column atomically. This trigger is now a thin orchestrator: it
 * delegates to the CAE, then handles the *side effects* the CAE
 * deliberately doesn't own:
 *
 *   1. auto-POA&M-on-NOT-MET (per the customer's "outstanding →
 *      POA&M" rule)
 *   2. control_adjudication_history row (audit trail of transitions)
 *   3. the result tally (rescored / met-flips / notmet-flips /
 *      poam-elevators-revoked)
 *
 * Best-effort: per-control failures are caught and counted; the
 * trigger never throws so a scoring blip can't roll back the
 * evidence write that committed before it.
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationHistory,
  controlAdjudicationSnapshots,
  controlRecords,
  controls,
} from "@/db/schema";
import {
  persistAdjudication,
  scoreControl,
} from "@/lib/evidence-engine/adjudication/scorer";

import { ensureDraftPoamForNotMet } from "./auto-poam";

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

  if (controlSet.length === 0) return result;

  // Pull the prior canonical fields per control so we can detect
  // transitions for history + tally + elevator-revocation tracking.
  // Minimal column set; we don't need the full snapshot here.
  const priorRows = await db
    .select({
      controlId: controlAdjudicationSnapshots.controlId,
      aggregateFinding: controlAdjudicationSnapshots.aggregateFinding,
      metVia: controlAdjudicationSnapshots.metVia,
      objectiveVerdicts: controlAdjudicationSnapshots.objectiveVerdicts,
    })
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
  const priorMap = new Map(priorRows.map((r) => [r.controlId, r] as const));

  // Pull control titles for nicer auto-POA&M weakness_description text.
  const titleRows = await db
    .select({ controlId: controls.controlId, title: controls.title })
    .from(controls)
    .where(
      sql`${controls.controlId} IN (${sql.join(
        controlSet.map((c) => sql`${c}`),
        sql`, `,
      )})`,
    );
  const titleMap = new Map(titleRows.map((t) => [t.controlId, t.title] as const));

  for (const cid of controlSet) {
    try {
      // CAE scorer produces canonical output directly; no projector
      // layer to overwrite via a second UPDATE.
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

      // Single atomic write: rollup + canonical fields + elevator pointers.
      await persistAdjudication({ orgId: input.organizationId }, adj);
      result.rescored++;

      const prior = priorMap.get(cid);

      // Auto-POA&M-on-NOT_MET: a side effect of the rescore that lives
      // outside the CAE on purpose — POA&M creation isn't a scoring
      // concern. Idempotent: if any open POA&M already exists for the
      // control, this no-ops.
      if (adj.aggregate_finding === "NOT_MET") {
        const r = await ensureDraftPoamForNotMet({
          organizationId: input.organizationId,
          controlId: cid,
          controlTitle: titleMap.get(cid) ?? null,
        });
        if (r.created) result.draftPoamsCreated++;
      }

      // Tally transitions for the caller's report.
      if (
        prior?.aggregateFinding === "MET" &&
        adj.aggregate_finding === "NOT_MET"
      ) {
        result.metFlipsToNotMet++;
      } else if (
        prior?.aggregateFinding === "NOT_MET" &&
        adj.aggregate_finding === "MET"
      ) {
        result.notMetFlipsToMet++;
      }
      if (
        prior?.metVia === "operational_plan_of_action" &&
        adj.met_via !== "operational_plan_of_action"
      ) {
        result.poamElevatorsRevoked++;
      }

      // History row — only when something materially changed. The
      // SSP audit trail walks these to reconstruct the per-control
      // story over time.
      if (
        prior?.aggregateFinding !== adj.aggregate_finding ||
        prior?.metVia !== adj.met_via
      ) {
        // Fetch the snapshot id we just wrote (or updated) so the
        // history row references it.
        const [snap] = await db
          .select({ id: controlAdjudicationSnapshots.id })
          .from(controlAdjudicationSnapshots)
          .where(
            and(
              eq(controlAdjudicationSnapshots.organizationId, input.organizationId),
              eq(controlAdjudicationSnapshots.controlId, cid),
            ),
          )
          .limit(1);
        await db.insert(controlAdjudicationHistory).values({
          organizationId: input.organizationId,
          controlId: cid,
          snapshotId: snap?.id ?? null,
          priorAggregateFinding: prior?.aggregateFinding ?? null,
          newAggregateFinding: adj.aggregate_finding,
          priorMetVia: prior?.metVia ?? null,
          newMetVia: adj.met_via,
          priorObjectiveVerdicts: (prior?.objectiveVerdicts as unknown[]) ?? null,
          newObjectiveVerdicts: adj.objective_verdicts as unknown[],
          triggerSource: input.triggerSource,
          triggeredByUserId: input.triggeredByUserId ?? null,
        });
      }
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
