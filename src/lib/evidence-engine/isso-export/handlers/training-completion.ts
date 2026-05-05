/**
 * training_completion handler — v1.1 ISSO export §4.8 + AT family addition.
 *
 * Two sub-sections:
 *
 *  - completions_during_period[] — actual training completion events
 *    observed during the review window. Each item lands as the
 *    appropriate entry type based on training_topic_kind:
 *      "initial"    → initial_training_completion
 *      "annual"     → annual_training_completion
 *      "role_based" → role_based_training_completion
 *    Idempotent on (subject_user, training_name, completed_at).
 *
 *  - expiring_attestations[] — attestations approaching expiry. Logged
 *    only (not written as register entries) — these drive admin reminder
 *    workflow and surface in the Monitoring tab via Sprint 6.
 *
 * Backs §3.2.1, §3.2.2, §3.2.3.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.2.1", "3.2.2", "3.2.3"] as const;

type DeliveryMethod = "lms" | "in_person" | "virtual" | "self_study" | "other";
type TopicKind = "initial" | "annual" | "role_based";

interface CompletionItem {
  subject_user?: string;
  training_topic_kind?: TopicKind | string;
  training_name?: string;
  completed_at?: string;
  delivery_method?: DeliveryMethod | string;
  // Topic-specific fields
  hire_date?: string | null;
  training_year?: number | null;
  role?: string | null;
  required_by?: string | null;
  // Common optional
  score?: number | null;
  certificate_id?: string | null;
  notes?: string | null;
}

interface ExpiringItem {
  subject_user?: string;
  training_topic?: string;
  expires_at?: string;
  days_until_expiry?: number;
}

interface TrainingCompletionPayload {
  completions_during_period?: CompletionItem[];
  expiring_attestations?: ExpiringItem[];
}

function entryTypeForTopicKind(kind: string | undefined): string {
  if (kind === "initial") return "initial_training_completion";
  if (kind === "role_based") return "role_based_training_completion";
  return "annual_training_completion";
}

export const training_completionHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "training_completion",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as TrainingCompletionPayload;

  // ── completions_during_period[] ────────────────────────────────────────
  const completions = section.completions_during_period ?? [];

  // ── expiring_attestations[] ────────────────────────────────────────────
  // These are reminders, not register entries. Log so they show up in
  // /admin/audit-logs; Sprint 6 wires them into the Monitoring tab.
  const expiring = section.expiring_attestations ?? [];
  for (const e of expiring) {
    if (!e.subject_user || !e.training_topic) continue;
    console.log(
      JSON.stringify({
        event: "enclavewatch.training.attestation_expiring",
        orgId: ctx.orgId,
        subjectUser: e.subject_user,
        trainingTopic: e.training_topic,
        expiresAt: e.expires_at,
        daysUntilExpiry: e.days_until_expiry,
        manifestId: ctx.manifestId,
      }),
    );
  }
  if (expiring.length > 0) {
    result.warnings.push(
      `${expiring.length} expiring training attestation(s) flagged — surfaced via audit log`,
    );
  }

  if (completions.length === 0) {
    if (expiring.length > 0) result.controls_touched = [...COVERED];
    return result;
  }

  // Ensure register exists.
  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — completions not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("training_completion");
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
    result.warnings.push("training_completion register not provisioned");
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

  const now = new Date();

  for (const c of completions) {
    if (!c.subject_user || !c.training_name || !c.completed_at) {
      result.warnings.push(
        "training_completion missing subject_user/training_name/completed_at — skipped",
      );
      continue;
    }

    const entryType = entryTypeForTopicKind(c.training_topic_kind);

    const entryData: Record<string, unknown> = {
      subject_user: c.subject_user,
      training_name: c.training_name,
      completed_at: c.completed_at,
      delivery_method: c.delivery_method ?? "lms",
      score: c.score ?? null,
      certificate_id: c.certificate_id ?? null,
      notes: c.notes ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };
    // Topic-specific fields:
    if (entryType === "initial_training_completion") {
      entryData.hire_date = c.hire_date ?? null;
    } else if (entryType === "annual_training_completion") {
      entryData.training_year =
        c.training_year ?? new Date(c.completed_at).getUTCFullYear();
    } else if (entryType === "role_based_training_completion") {
      entryData.role = c.role ?? "(unspecified)";
      entryData.required_by = c.required_by ?? "(unspecified)";
    }

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, entryType),
          sql`${governanceRegisterEntries.entryData} ->> 'subject_user' = ${c.subject_user}`,
          sql`${governanceRegisterEntries.entryData} ->> 'training_name' = ${c.training_name}`,
          sql`${governanceRegisterEntries.entryData} ->> 'completed_at' = ${c.completed_at}`,
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
        entryType,
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
