/**
 * assessment_findings handler — v1.1 ISSO export §4.10.
 *
 * The ISSO surfaces lighter-weight observations during weekly review:
 * drift, evidence gaps, watchlist items, improvement opportunities. Not
 * to be confused with formal `finding_recorded` rows from a real
 * assessment — `review_observation` is its own type so the assessor
 * can distinguish "ISSO weekly note" from "formal C3PAO finding."
 *
 * Backs §3.12.1.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import {
  applyAutoRecordedV1Fields,
  buildEvidenceRefsBase,
  type EvidenceRef,
} from "./_verbosity";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.12.1"] as const;

interface ReviewObservationItem {
  observation_id?: string;
  control_id?: string;
  finding_type?:
    | "drift_detected"
    | "evidence_gap"
    | "process_lapse"
    | "watchlist_item"
    | "improvement_opportunity"
    | "other"
    | string;
  severity?:
    | "critical"
    | "high"
    | "medium"
    | "low"
    | "informational"
    | string;
  summary?: string;
  recommended_action?: string;
  notes?: string | null;
  ticket?: string | null;
}

interface AssessmentFindingsPayload {
  review_observations?: ReviewObservationItem[];
}

export const assessment_findingsHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "assessment_findings",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const items =
    ((payload ?? {}) as AssessmentFindingsPayload).review_observations ?? [];
  if (items.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push(
      "no primary boundary for org — review_observations not written",
    );
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("assessment_findings");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matchingRegisters.length === 0) {
    result.warnings.push("assessment_findings register not provisioned");
    return result;
  }

  let targetRegisterId = matchingRegisters[0].id;
  if (matchingRegisters.length > 1) {
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { id: r.id, n: c?.n ?? 0 };
      }),
    );
    counts.sort((a, b) => b.n - a.n);
    targetRegisterId = counts[0].id;
  }

  const observedAtIso = ctx.reviewPeriodEnd.toISOString();
  const observedBy = "ISSO weekly review";
  const now = new Date();

  for (const item of items) {
    if (
      !item.observation_id ||
      !item.control_id ||
      !item.finding_type ||
      !item.severity ||
      !item.summary ||
      !item.recommended_action
    ) {
      result.warnings.push(
        "review_observation missing required fields — skipped",
      );
      continue;
    }

    // §1 evidence_refs[] — base manifest ref + ticket if present + the
    // control_id this observation is about so the auditor can navigate.
    const evidenceRefs: EvidenceRef[] = buildEvidenceRefsBase(ctx);
    if (item.ticket) {
      evidenceRefs.push({
        type: "ticket_url",
        value: item.ticket,
        label: "Tracking ticket for this observation",
      });
    }
    evidenceRefs.push({
      type: "control_id",
      value: item.control_id,
      label: "Control covered by this observation",
    });

    const entryData: Record<string, unknown> = applyAutoRecordedV1Fields(
      {
        observation_id: item.observation_id,
        control_id: item.control_id,
        finding_type: item.finding_type,
        severity: item.severity,
        summary: item.summary,
        recommended_action: item.recommended_action,
        observed_at: observedAtIso,
        observed_by: observedBy,
        notes: item.notes ?? null,
        ticket: item.ticket ?? null,
        // §1 actor_*.
        actor_user: observedBy,
        actor_user_id: null,
        // §1 event_type / event_classification.
        event_type: "review_observation_recorded",
        event_classification: `observation_${item.finding_type}`,
        // §1 time anchors.
        detected_at: observedAtIso,
        occurred_at: observedAtIso,
        signed_at: observedAtIso,
        // §1 location.
        system: `control:${item.control_id}`,
        scope_arm: null,
        // §1 outcome / actions_taken.
        outcome: item.recommended_action,
        actions_taken: null,
      },
      {
        ctx,
        boundaryId: primaryBoundary.id,
        detectionMethod: "isso_observed",
        detectionSource:
          "ISSO weekly review of assessment_findings register (lightweight observations, not formal C3PAO findings)",
        evidenceRefs,
      },
    );

    // Idempotent on observation_id (vault generates this stable id).
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "review_observation"),
          sql`${governanceRegisterEntries.entryData} ->> 'observation_id' = ${item.observation_id}`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status: "final",
          finalizedAt: now,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "review_observation",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
