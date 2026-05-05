/**
 * personnel_screening handler — v1.1 ISSO export, PS family addition
 * (per orientation map).
 *
 * Section: events_during_period[] — personnel lifecycle events observed
 * during the review window (hire, terminate, role change, etc.). Each
 * item lands as a `personnel_event` entry, idempotent on (subject_user,
 * event_type, occurred_at).
 *
 * Backs §3.9.1, §3.9.2 (HR-driven, but the events ISSO observes give
 * the assessor "show me you tracked your hires/terminations" evidence
 * without forcing a parallel HR system).
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

const COVERED = ["3.9.1", "3.9.2"] as const;

type EventType =
  | "hire"
  | "terminate"
  | "role_change"
  | "transfer"
  | "leave_of_absence"
  | "return_from_leave";

interface PersonnelEvent {
  subject_user?: string;
  event_type?: EventType | string;
  occurred_at?: string;
  screening_status?: "passed" | "pending" | "n_a" | "waived" | string | null;
  previous_role?: string | null;
  new_role?: string | null;
  ticket?: string | null;
  notes?: string | null;
}

interface PersonnelScreeningPayload {
  events_during_period?: PersonnelEvent[];
}

export const personnel_screeningHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "personnel_screening",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const events =
    ((payload ?? {}) as PersonnelScreeningPayload).events_during_period ?? [];
  if (events.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — events not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("personnel_screening");
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
    result.warnings.push("personnel_screening register not provisioned");
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

  for (const e of events) {
    if (!e.subject_user || !e.event_type || !e.occurred_at) {
      result.warnings.push(
        "personnel_event missing subject_user/event_type/occurred_at — skipped",
      );
      continue;
    }

    const evidenceRefs: EvidenceRef[] = buildEvidenceRefsBase(ctx);
    if (e.ticket) {
      evidenceRefs.push({
        type: "ticket_url",
        value: e.ticket,
        label: "HR ticket / record",
      });
    }
    evidenceRefs.push({
      type: "hr_subject_user",
      value: e.subject_user,
      label: `Personnel record subject (${e.event_type})`,
    });

    const entryData: Record<string, unknown> = applyAutoRecordedV1Fields(
      {
        subject_user: e.subject_user,
        event_type: e.event_type,
        occurred_at: e.occurred_at,
        observed_at: observedAtIso,
        observed_by: observedBy,
        screening_status: e.screening_status ?? "n_a",
        previous_role: e.previous_role ?? null,
        new_role: e.new_role ?? null,
        ticket: e.ticket ?? null,
        notes: e.notes ?? null,
        // §1 actor_* — subject of the personnel event.
        actor_user: e.subject_user,
        actor_user_id: null,
        // §1 event_classification (event_type already set above).
        event_classification: `personnel_${e.event_type}`,
        // §1 time anchors. detected_at = ISSO observed; occurred_at = the
        // actual lifecycle event timestamp. signed_at populated when the
        // ISSO observed and recorded the event.
        detected_at: observedAtIso,
        signed_at: observedAtIso,
        // §1 location.
        system: "personnel_register",
        scope_arm: null,
        // §1 outcome / actions_taken.
        outcome: e.screening_status ?? "n_a",
        actions_taken:
          e.event_type === "role_change" || e.event_type === "transfer"
            ? `${e.previous_role ?? "?"} → ${e.new_role ?? "?"}`
            : e.notes ?? null,
      },
      {
        ctx,
        boundaryId: primaryBoundary.id,
        detectionMethod: "isso_observed",
        detectionSource: "ISSO weekly review of personnel events",
        evidenceRefs,
      },
    );

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "personnel_event"),
          sql`${governanceRegisterEntries.entryData} ->> 'subject_user' = ${e.subject_user}`,
          sql`${governanceRegisterEntries.entryData} ->> 'event_type' = ${e.event_type}`,
          sql`${governanceRegisterEntries.entryData} ->> 'occurred_at' = ${e.occurred_at}`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({ entryData, status: "final", finalizedAt: now, updatedAt: now })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "personnel_event",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
