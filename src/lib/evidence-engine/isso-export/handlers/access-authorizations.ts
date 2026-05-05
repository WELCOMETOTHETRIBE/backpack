/**
 * access_authorizations handler — v1.1 ISSO export §4.6.
 *
 * The ISSO surfaces anomalies during weekly review of the access_
 * authorization register: dormant accounts, unjustified grants, missing
 * approvals, etc. Each item lands as a `weekly_review_finding` entry,
 * idempotent on (subject_user, finding_type, observed_at).
 *
 * Backs §3.1.5, §3.1.6, §3.5.1, §3.10.6.
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

const COVERED = ["3.1.5", "3.1.6", "3.5.1", "3.10.6"] as const;

type FindingType =
  | "dormant_account"
  | "unjustified_grant"
  | "missing_approval"
  | "stale_role"
  | "unauthorized_change"
  | "other";

interface ReviewFinding {
  subject_user?: string;
  finding_type?: FindingType | string;
  severity?: "critical" | "high" | "medium" | "low" | "informational" | string;
  recommended_action?: string;
  notes?: string | null;
  ticket?: string | null;
}

interface AccessAuthorizationsPayload {
  weekly_review_findings?: ReviewFinding[];
}

export const access_authorizationsHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "access_authorizations",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const findings =
    ((payload ?? {}) as AccessAuthorizationsPayload).weekly_review_findings ?? [];
  if (findings.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — findings not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("access_authorization");
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
    result.warnings.push("access_authorization register not provisioned");
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

  for (const f of findings) {
    if (
      !f.subject_user ||
      !f.finding_type ||
      !f.severity ||
      !f.recommended_action
    ) {
      result.warnings.push(
        `weekly_review_finding missing required fields — skipped`,
      );
      continue;
    }

    // §1 evidence_refs[] — base manifest ref + ticket if present.
    const evidenceRefs: EvidenceRef[] = buildEvidenceRefsBase(ctx);
    if (f.ticket) {
      evidenceRefs.push({
        type: "ticket_url",
        value: f.ticket,
        label: "Tracking ticket for this finding",
      });
    }

    const entryData: Record<string, unknown> = applyAutoRecordedV1Fields(
      {
        subject_user: f.subject_user,
        finding_type: f.finding_type,
        severity: f.severity,
        recommended_action: f.recommended_action,
        observed_at: observedAtIso,
        observed_by: observedBy,
        notes: f.notes ?? null,
        ticket: f.ticket ?? null,
        // §1 actor_* — ISSO is the observing actor.
        actor_user: observedBy,
        actor_user_id: null,
        // §1 event_type / event_classification.
        event_type: "weekly_review_finding",
        event_classification: `access_${f.finding_type}`,
        // §1 time anchors.
        detected_at: observedAtIso,
        occurred_at: observedAtIso,
        signed_at: observedAtIso,
        // §1 location.
        system: "access_authorization_register",
        scope_arm: null,
        // §1 outcome / actions_taken — outcome alias for recommended_action
        // per blueprint Phase 4 verbosity audit; actions_taken null until
        // admin remediates.
        outcome: f.recommended_action,
        actions_taken: null,
      },
      {
        ctx,
        boundaryId: primaryBoundary.id,
        detectionMethod: "isso_observed",
        detectionSource: "ISSO weekly review of access_authorization register",
        evidenceRefs,
      },
    );

    // Idempotent on (subject_user, finding_type, observed_at) — same
    // anomaly reported in same period is a no-op replace.
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "weekly_review_finding"),
          sql`${governanceRegisterEntries.entryData} ->> 'subject_user' = ${f.subject_user}`,
          sql`${governanceRegisterEntries.entryData} ->> 'finding_type' = ${f.finding_type}`,
          sql`${governanceRegisterEntries.entryData} ->> 'observed_at' = ${observedAtIso}`,
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
        entryType: "weekly_review_finding",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
