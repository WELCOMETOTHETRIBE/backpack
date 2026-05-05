/**
 * policy_review handler — v1.1 ISSO export §4.9.
 *
 * The ISSO surfaces policy/procedure documents approaching or past their
 * review cadence. Each item lands as a `stale_document_flag` entry on the
 * policy_review register, idempotent on (doc_code, observed_at).
 *
 * Backs §3.12.4.
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

const COVERED = ["3.12.4"] as const;

type RecommendedAction =
  | "re_review_now"
  | "schedule_review"
  | "retire"
  | "supersede"
  | "extend_via_exception";

interface StaleDocumentItem {
  doc_code?: string;
  last_reviewed_at?: string | null;
  days_since_review?: number;
  recommended_action?: RecommendedAction | string;
  notes?: string | null;
  ticket?: string | null;
}

interface PolicyReviewPayload {
  stale_documents?: StaleDocumentItem[];
}

export const policy_reviewHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "policy_review",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const items = ((payload ?? {}) as PolicyReviewPayload).stale_documents ?? [];
  if (items.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — stale_documents not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("policy_review");
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
    result.warnings.push("policy_review register not provisioned");
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
    if (!item.doc_code || !item.recommended_action) {
      result.warnings.push(
        "stale_document missing doc_code or recommended_action — skipped",
      );
      continue;
    }

    const entryData: Record<string, unknown> = {
      doc_code: item.doc_code,
      last_reviewed_at: item.last_reviewed_at ?? null,
      days_since_review: item.days_since_review ?? null,
      recommended_action: item.recommended_action,
      observed_at: observedAtIso,
      observed_by: observedBy,
      notes: item.notes ?? null,
      ticket: item.ticket ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "stale_document_flag"),
          sql`${governanceRegisterEntries.entryData} ->> 'doc_code' = ${item.doc_code}`,
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
        entryType: "stale_document_flag",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
