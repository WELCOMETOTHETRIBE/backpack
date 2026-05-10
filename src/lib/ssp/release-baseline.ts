/**
 * SSP Release Baseline service — Phase 1 of "controlled baseline +
 * drift."
 *
 * A signed SSP at version N already pins everything that matters: the
 * payload bytes (ssp_documents.payload_sha256), the section narratives
 * (ssp_section_revisions), the cited evidence (ssp_evidence_citations),
 * and the QMS-side release identity (ssp_doc_control_submissions
 * .qms_document_number + qms_sha256). What we don't have today is a
 * single "this released submission is the controlled baseline" pointer
 * — so this service writes that row, exactly once per release event,
 * inside the linker's existing transaction.
 *
 * Immutability contract: this module exports no UPDATE-shaped helper
 * other than markBaselineSuperseded, which only flips status + sets
 * supersession pointers. Field-level mutations on a finalized baseline
 * are a service-layer-prohibited operation; bypassing the service to
 * write SQL directly is out of contract. A future migration MAY add a
 * row trigger that rejects UPDATE on the load-bearing columns once the
 * baseline is finalized.
 *
 * Tenant isolation: every read + write is scoped by organizationId,
 * matching the rest of the SSP module.
 */
import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  sspDocuments,
  sspReleaseBaselines,
  sspSignoffs,
} from "@/db/schema";

/**
 * The drizzle handle the service runs against. Always a transaction
 * in production — the linker wraps every release in db.transaction —
 * but typed permissively as `db | tx-callback-arg` so test seams and
 * admin scripts can pass `db` directly when atomicity isn't a concern.
 */
type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateReleaseBaselineInput {
  organizationId: string;
  sspDocumentId: string;
  /** The submission row that just flipped submitted → released. */
  sspDocControlSubmissionId: string;
  /** Stable QMS doc number ("SSP-001"). */
  qmsDocumentNumber: string;
  /** What QMS actually signed over. */
  qmsSha256: string;
  releasedAt: Date;
  /**
   * The QMS manifest run_id that carried the release. Optional — if
   * an admin re-runs the linker out-of-band, they can pass null and
   * the baseline still gets written.
   */
  qmsManifestRunId?: string | null;
  releaseNotes?: string | null;
  appVersion?: string | null;
  gitCommitSha?: string | null;
}

export interface ReleaseBaselineResult {
  baselineId: string;
  /** false if a baseline already existed (idempotent re-run). */
  created: boolean;
  /** Submission IDs whose baselines were marked superseded by this run. */
  supersededBaselineIds: string[];
}

/**
 * Idempotently create the release baseline for a just-released SSP
 * submission. Safe to call multiple times for the same submission;
 * subsequent calls return the existing baseline with created=false.
 *
 * MUST be called inside the same transaction that flips the submission
 * to 'released' so the two writes are atomic.
 *
 * Returns supersededBaselineIds so the caller can write per-row audit
 * entries if it wants. (The caller — the linker — has its own audit
 * pattern.)
 */
export async function createOrGetReleaseBaseline(
  tx: Tx,
  input: CreateReleaseBaselineInput,
): Promise<ReleaseBaselineResult> {
  // 1. Idempotency check: if a baseline already exists for this
  //    submission, return it. The unique index on
  //    ssp_doc_control_submission_id is the hard guarantee; this
  //    short-circuit avoids needing to swallow a unique-violation.
  const [existing] = await tx
    .select({ id: sspReleaseBaselines.id })
    .from(sspReleaseBaselines)
    .where(
      and(
        eq(sspReleaseBaselines.organizationId, input.organizationId),
        eq(
          sspReleaseBaselines.sspDocControlSubmissionId,
          input.sspDocControlSubmissionId,
        ),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      baselineId: existing.id,
      created: false,
      supersededBaselineIds: [],
    };
  }

  // 2. Read the source rows we're snapshotting. We do this inside the
  //    transaction so the baseline can't drift away from the SSP doc
  //    state mid-write.
  const [doc] = await tx
    .select({
      id: sspDocuments.id,
      organizationId: sspDocuments.organizationId,
      versionNumber: sspDocuments.versionNumber,
      boundaryId: sspDocuments.boundaryId,
      payloadSha256: sspDocuments.payloadSha256,
    })
    .from(sspDocuments)
    .where(
      and(
        eq(sspDocuments.id, input.sspDocumentId),
        eq(sspDocuments.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!doc) {
    throw new Error(
      `SSP document ${input.sspDocumentId} not found for org ${input.organizationId} — cannot create release baseline`,
    );
  }

  const signoffsSnapshot = await snapshotSspSignoffs(tx, {
    organizationId: input.organizationId,
    sspDocumentId: input.sspDocumentId,
  });

  // 3. Insert the baseline. We do this BEFORE supersession so the
  //    new row exists to be referenced from superseded_by_id.
  const [inserted] = await tx
    .insert(sspReleaseBaselines)
    .values({
      organizationId: input.organizationId,
      sspDocControlSubmissionId: input.sspDocControlSubmissionId,
      sspDocumentId: input.sspDocumentId,
      sspVersionNumber: doc.versionNumber,
      boundaryId: doc.boundaryId,
      status: "active",
      payloadSha256: doc.payloadSha256,
      qmsDocumentNumber: input.qmsDocumentNumber,
      qmsSha256: input.qmsSha256.toLowerCase(),
      signoffsJson: signoffsSnapshot,
      qmsManifestRunId: input.qmsManifestRunId ?? null,
      releasedAt: input.releasedAt,
      releaseNotes: input.releaseNotes ?? null,
      appVersion: input.appVersion ?? null,
      gitCommitSha: input.gitCommitSha ?? null,
    })
    .returning({ id: sspReleaseBaselines.id });

  if (!inserted) {
    throw new Error(
      `failed to insert ssp_release_baselines row for submission ${input.sspDocControlSubmissionId}`,
    );
  }

  // 4. Mark prior 'active' baselines for the same boundary as
  //    'superseded' with superseded_by_id pointing at the new row.
  //    Boundary-scoped (not org-scoped) so multi-boundary orgs don't
  //    accidentally retire each other's baselines.
  const supersededRows = await tx
    .update(sspReleaseBaselines)
    .set({
      status: "superseded",
      supersededAt: new Date(),
      supersededById: inserted.id,
    })
    .where(
      and(
        eq(sspReleaseBaselines.organizationId, input.organizationId),
        eq(sspReleaseBaselines.boundaryId, doc.boundaryId),
        eq(sspReleaseBaselines.status, "active"),
        ne(sspReleaseBaselines.id, inserted.id),
      ),
    )
    .returning({ id: sspReleaseBaselines.id });

  return {
    baselineId: inserted.id,
    created: true,
    supersededBaselineIds: supersededRows.map((r) => r.id),
  };
}

/**
 * Look up the active baseline for a (org, boundary). Used by drift
 * detection (Phase 2) and by UI surfaces that show "this SSP is tied
 * to baseline [X]."
 */
export async function getActiveBaselineForBoundary(
  tx: Tx,
  organizationId: string,
  boundaryId: string,
) {
  const [row] = await tx
    .select()
    .from(sspReleaseBaselines)
    .where(
      and(
        eq(sspReleaseBaselines.organizationId, organizationId),
        eq(sspReleaseBaselines.boundaryId, boundaryId),
        eq(sspReleaseBaselines.status, "active"),
      ),
    )
    .orderBy(desc(sspReleaseBaselines.releasedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Build the deterministic signoffs snapshot stored on the baseline
 * row. Sorted by (signoff_kind, signed_at) so two reads of the same
 * underlying ssp_signoffs rows produce byte-identical JSON, which
 * matters for any future hash-of-baseline use case.
 *
 * Exported for testability — this is the only piece of the service
 * that's worth unit-testing in isolation.
 */
export async function snapshotSspSignoffs(
  tx: Tx,
  input: { organizationId: string; sspDocumentId: string },
): Promise<SignoffSnapshot[]> {
  const rows = await tx
    .select({
      id: sspSignoffs.id,
      signoffKind: sspSignoffs.signoffKind,
      signerUserId: sspSignoffs.signerUserId,
      signerDisplayName: sspSignoffs.signerDisplayName,
      signerTitle: sspSignoffs.signerTitle,
      dataHash: sspSignoffs.dataHash,
      signedAt: sspSignoffs.signedAt,
      signatureAlg: sspSignoffs.signatureAlg,
    })
    .from(sspSignoffs)
    .where(
      and(
        eq(sspSignoffs.organizationId, input.organizationId),
        eq(sspSignoffs.sspDocumentId, input.sspDocumentId),
      ),
    );

  return canonicalizeSignoffs(rows);
}

export interface SignoffSnapshot {
  signoff_id: string;
  signoff_kind: string;
  signer_user_id: string | null;
  signer_display_name: string;
  signer_title: string;
  data_hash: string;
  signed_at: string;
  signature_alg: string | null;
}

/**
 * Pure helper exported for unit-testing. Sorts by (signoff_kind,
 * signed_at, signoff_id) and renders timestamps as ISO-8601 strings
 * so a re-snapshot of unchanged data produces byte-identical JSON.
 */
export function canonicalizeSignoffs(
  rows: Array<{
    id: string;
    signoffKind: string;
    signerUserId: string | null;
    signerDisplayName: string;
    signerTitle: string;
    dataHash: string;
    signedAt: Date;
    signatureAlg: string | null;
  }>,
): SignoffSnapshot[] {
  return rows
    .map((r) => ({
      signoff_id: r.id,
      signoff_kind: r.signoffKind,
      signer_user_id: r.signerUserId,
      signer_display_name: r.signerDisplayName,
      signer_title: r.signerTitle,
      data_hash: r.dataHash,
      signed_at: r.signedAt.toISOString(),
      signature_alg: r.signatureAlg,
    }))
    .sort((a, b) => {
      if (a.signoff_kind !== b.signoff_kind) {
        return a.signoff_kind < b.signoff_kind ? -1 : 1;
      }
      if (a.signed_at !== b.signed_at) {
        return a.signed_at < b.signed_at ? -1 : 1;
      }
      return a.signoff_id < b.signoff_id ? -1 : 1;
    });
}
