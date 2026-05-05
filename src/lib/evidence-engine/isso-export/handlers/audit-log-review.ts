/**
 * audit_log_review handler — extracted from
 * /api/enclavewatch/weekly-review/ingest/route.ts so v1.1 ingests use the
 * same write path. Backs §3.1.7, §3.3.2, §3.3.3, §3.3.5, §3.12.3, §3.14.3,
 * §3.14.7.
 *
 * Idempotent on `(organizationId, review_period_end)`. Re-ingesting the same
 * weekly_review payload replaces the existing entry; doesn't duplicate.
 *
 * Payload shape (per spec §4.1):
 * {
 *   "weekly_review": {
 *     "review_period_start": RFC3339,
 *     "review_period_end":   RFC3339,
 *     "reviewed_at":         RFC3339,
 *     "reviewed_by":         string,
 *     "summary":             string,
 *     "findings":            string,
 *     "tickets_created":     string | null,
 *     // codex extension fields:
 *     "enclavewatch_run_id": string,
 *     "vault_id":            string,
 *     "review_result":       "clean" | "findings" | "blocked",
 *     "evidence_bundle_hash": string | null,
 *     "weekly_manifest_hash": string | null,
 *     "source":              "enclavewatch_weekly_review"
 *   }
 * }
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

/**
 * Controls whose register lane is satisfied by an audit_log_review entry.
 * Same list as the legacy weekly-review/ingest endpoint — kept here so the
 * v1.1 dispatcher writes the exact same evidence_finding rows the v1.0 path
 * does.
 */
const COVERED_CONTROLS = [
  "3.1.7",
  "3.3.2",
  "3.3.3",
  "3.3.5",
  "3.12.3",
  "3.14.3",
  "3.14.7",
] as const;

interface WeeklyReviewPayload {
  review_period_start?: string;
  review_period_end?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  summary?: string;
  findings?: string;
  tickets_created?: string | null;
  enclavewatch_run_id?: string;
  vault_id?: string;
  review_result?: string;
  evidence_bundle_hash?: string | null;
  weekly_manifest_hash?: string | null;
  source?: string;
}

interface SectionPayload {
  weekly_review?: WeeklyReviewPayload;
}

export const audit_log_reviewHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "audit_log_review",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = payload as SectionPayload | null;
  const wr = section?.weekly_review;
  if (!wr) {
    result.warnings.push(
      "audit_log_review.weekly_review missing or empty — handler is a no-op for this manifest",
    );
    return result;
  }

  // Locate the org's primary boundary (entries are scoped to a boundary).
  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push(
      "no primary boundary for org — cannot anchor audit_log_review entry",
    );
    return result;
  }

  // Resolve the audit_log_review register row (alias-aware).
  const auditCandidates = resolveRegisterKeyCandidates("audit_log_review");
  const [auditReg] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          auditCandidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!auditReg) {
    result.warnings.push(
      "audit_log_review register not provisioned for org — entry not written",
    );
    return result;
  }

  const reviewPeriodEndIso = wr.review_period_end ?? ctx.reviewPeriodEnd.toISOString();
  const reviewedAtIso = wr.reviewed_at ?? reviewPeriodEndIso ?? new Date().toISOString();
  const reviewerName = wr.reviewed_by ?? "ISSO";
  const summary =
    wr.summary ??
    `EnclaveWatch weekly review ${wr.review_period_start?.slice(0, 10) ?? "?"} → ${reviewPeriodEndIso.slice(0, 10)}: ${wr.review_result ?? "n/a"}.`;

  // §1 evidence_refs[] — base manifest ref plus the optional bundle/run refs
  // so the auditor can navigate from this single entry to the full chain
  // (signed bundle hash, EnclaveWatch run, weekly manifest hash).
  const evidenceRefs: EvidenceRef[] = buildEvidenceRefsBase(ctx);
  if (wr.evidence_bundle_hash) {
    evidenceRefs.push({
      type: "evidence_file_hash",
      value: wr.evidence_bundle_hash,
      label: "Signed evidence bundle (sha256)",
    });
  }
  if (wr.weekly_manifest_hash && wr.weekly_manifest_hash !== ctx.manifestId) {
    evidenceRefs.push({
      type: "evidence_file_hash",
      value: wr.weekly_manifest_hash,
      label: "Weekly manifest hash",
    });
  }
  if (wr.enclavewatch_run_id) {
    evidenceRefs.push({
      type: "external_id",
      value: wr.enclavewatch_run_id,
      label: "EnclaveWatch weekly-review run id",
    });
  }

  const auditEntryData: Record<string, unknown> = applyAutoRecordedV1Fields(
    {
      // Handler-specific fields (preserved from prior shape for back-compat).
      review_period_start:
        wr.review_period_start ?? ctx.reviewPeriodStart?.toISOString(),
      review_period_end: reviewPeriodEndIso,
      reviewed_at: reviewedAtIso,
      reviewed_by: reviewerName,
      summary,
      findings: wr.findings ?? "no findings",
      tickets_created: wr.tickets_created ?? null,
      enclavewatch_run_id: wr.enclavewatch_run_id ?? null,
      vault_id: wr.vault_id ?? ctx.vaultId,
      review_result: wr.review_result ?? null,
      evidence_bundle_hash: wr.evidence_bundle_hash ?? null,
      weekly_manifest_hash: wr.weekly_manifest_hash ?? null,
      source: wr.source ?? "enclavewatch_weekly_review",
      // §1 actor_* — surface the ISSO reviewer as the actor for audit chain.
      actor_user: reviewerName,
      actor_user_id: null,
      // §1 event_type / event_classification.
      event_type: "weekly_review_completed",
      event_classification: "isso_weekly_review",
      // §1 time anchors. occurred_at = reviewed_at; signed_at populated when
      // the reviewer signs the manifest (mirrored as reviewed_at).
      detected_at: reviewedAtIso,
      occurred_at: reviewedAtIso,
      signed_at: reviewedAtIso,
      // §1 location. system covers the audit log subsystem reviewed.
      system: "audit_log_subsystem",
      scope_arm: null,
      // §1 outcome / actions_taken — derived from manifest review_result +
      // findings string so the entry is self-explanatory in isolation.
      outcome: wr.review_result ?? null,
      actions_taken: wr.findings ?? null,
    },
    {
      ctx,
      boundaryId: primaryBoundary.id,
      detectionMethod: "isso_observed",
      detectionSource: "enclavewatch_weekly_review",
      evidenceRefs,
    },
  );

  // Idempotent on (registerId, review_period_end). Re-ingesting same period
  // updates in place rather than duplicating.
  const [existing] = await db
    .select({ id: governanceRegisterEntries.id })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, auditReg.id),
        sql`${governanceRegisterEntries.entryData} ->> 'review_period_end' = ${reviewPeriodEndIso}`,
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing) {
    await db
      .update(governanceRegisterEntries)
      .set({
        entryData: auditEntryData,
        status: "final",
        finalizedAt: now,
        entryType: "weekly_review",
        updatedAt: now,
      })
      .where(eq(governanceRegisterEntries.id, existing.id));
    result.entries_updated = 1;
  } else {
    await db.insert(governanceRegisterEntries).values({
      registerId: auditReg.id,
      boundaryId: primaryBoundary.id,
      entryData: auditEntryData,
      entryType: "weekly_review",
      status: "final",
      finalizedAt: now,
    });
    result.entries_inserted = 1;
  }

  result.controls_touched = [...COVERED_CONTROLS];
  return result;
};
