/**
 * Phase 3-Codex-inbound: link released QMS docs back to Codex
 * ssp_doc_control_submissions rows.
 *
 * Runs as a post-process step after the QMS governance manifest is
 * persisted (src/app/api/integrations/qms-manifest/ingest/route.ts).
 * For each manifest entry with document_type='ssp', look for an
 * ssp_doc_control_submissions row in 'submitted' state whose
 * submitted_payload_sha256 matches the manifest doc's sha256 (or whose
 * staging metadata otherwise matches). On match:
 *   1. Flip that row to 'released' with stamped qms_document_number,
 *      qms_sha256, released_at.
 *   2. Find the prior 'released' row(s) for the same ssp_document_id
 *      and mark them 'superseded' with superseded_by_id pointing at
 *      the newly-released row.
 *
 * Best-effort and idempotent: re-running on the same manifest is a
 * no-op because already-released rows aren't candidates for the
 * 'submitted' filter.
 *
 * This helper never throws — it logs unmatched manifest docs as
 * informational events but doesn't fail the ingest. The manifest
 * ingest is the source of truth for QMS state; the linker just
 * enriches Codex's view.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  sspDocControlSubmissions,
  sspDocuments,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { createOrGetReleaseBaseline } from "./release-baseline";
import {
  seedPolicyReviewEntryFromRelease,
  recomputePolicyReviewAffectedControls,
  type SeedResult,
} from "./seed-policy-review-from-release";

interface ManifestSspDoc {
  documentNumber: string;
  sha256: string;
  releasedAt: string | null;
  released: boolean;
}

export interface LinkResult {
  /** Manifest docs the linker considered (document_type='ssp'). */
  considered: number;
  /** Submissions flipped 'submitted' → 'released' on this run. */
  released: number;
  /** Older releases marked 'superseded' on this run. */
  superseded: number;
  /** SSP release-baselines created on this run (1:1 with `released`
   *  in the steady state; smaller if a baseline already existed for
   *  a re-linked submission). */
  baselinesCreated: number;
  /** Manifest SSPs with no matching submitted row in Codex. */
  unmatched: Array<{ documentNumber: string; sha256: string }>;
}

/**
 * Walk the manifest's freshly-persisted rows and link each released
 * SSP back to the corresponding Codex staging row.
 */
export async function linkReleasedSspsToSubmissions(input: {
  organizationId: string;
  manifestSsps: ManifestSspDoc[];
  /**
   * The QMS manifest run that triggered this linking pass. Optional
   * — admin-initiated re-link calls may not have one. When present,
   * it's stamped on every release-baseline created here for forensic
   * traceability.
   */
  qmsManifestRunId?: string | null;
}): Promise<LinkResult> {
  const result: LinkResult = {
    considered: input.manifestSsps.length,
    released: 0,
    superseded: 0,
    baselinesCreated: 0,
    unmatched: [],
  };
  if (input.manifestSsps.length === 0) return result;

  // Only consider manifest entries that are actually released — the
  // QMS manifest can include in-flight or draft docs depending on the
  // exporter's filters; we link only the ones that are formally
  // released.
  const releasedManifestSsps = input.manifestSsps.filter((m) => m.released);

  for (const mDoc of releasedManifestSsps) {
    const sha = mDoc.sha256.toLowerCase();
    // Find a 'submitted' row whose submitted_payload_sha256 matches.
    // The bridge contract guarantees the QMS-released sha256 is the
    // canonical_json_sha256 we sent (the QMS team confirmed they
    // don't re-canonicalize the payload they receive — they sign
    // over the bytes Codex sent). If they ever DO start re-canonicalizing,
    // we'd add a fallback match on documentNumber + ssp_version.
    const candidates = await db
      .select({
        id: sspDocControlSubmissions.id,
        sspDocumentId: sspDocControlSubmissions.sspDocumentId,
      })
      .from(sspDocControlSubmissions)
      .where(
        and(
          eq(sspDocControlSubmissions.organizationId, input.organizationId),
          eq(sspDocControlSubmissions.status, "submitted"),
          eq(sspDocControlSubmissions.submittedPayloadSha256, sha),
        ),
      )
      .limit(1);

    if (candidates.length === 0) {
      result.unmatched.push({
        documentNumber: mDoc.documentNumber,
        sha256: sha,
      });
      continue;
    }

    const target = candidates[0];
    const releasedAt = mDoc.releasedAt ? new Date(mDoc.releasedAt) : new Date();

    // Atomic: flip target → released, mark prior released rows
    // (same ssp_document_id, status='released') as superseded, and
    // write the SSP release baseline. All in one transaction so we
    // never have a 'released' submission without its controlled
    // baseline (or vice versa).
    let createdBaselineId: string | null = null;
    let baselineWasCreated = false;
    let supersededBaselineIds: string[] = [];
    let policyReviewSeed: SeedResult | null = null;
    await db.transaction(async (tx) => {
      await tx
        .update(sspDocControlSubmissions)
        .set({
          status: "released",
          qmsDocumentNumber: mDoc.documentNumber,
          qmsSha256: sha,
          releasedAt,
          updatedAt: new Date(),
        })
        .where(eq(sspDocControlSubmissions.id, target.id));

      // Same ssp_document_id, prior released rows → superseded by this row.
      // (In practice this set should be empty because each SSP version
      // gets exactly one release; the case fires when a release was
      // re-issued under the same version, which is rare but possible.)
      const supersededRows = await tx
        .update(sspDocControlSubmissions)
        .set({
          status: "superseded",
          supersededAt: new Date(),
          supersededById: target.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sspDocControlSubmissions.organizationId, input.organizationId),
            eq(sspDocControlSubmissions.sspDocumentId, target.sspDocumentId),
            eq(sspDocControlSubmissions.status, "released"),
            ne(sspDocControlSubmissions.id, target.id),
          ),
        )
        .returning({ id: sspDocControlSubmissions.id });
      result.superseded += supersededRows.length;

      // Write the controlled baseline. Idempotent on
      // ssp_doc_control_submission_id — re-linking the same submission
      // (e.g. on manifest re-ingest) returns the existing baseline.
      const baseline = await createOrGetReleaseBaseline(tx, {
        organizationId: input.organizationId,
        sspDocumentId: target.sspDocumentId,
        sspDocControlSubmissionId: target.id,
        qmsDocumentNumber: mDoc.documentNumber,
        qmsSha256: sha,
        releasedAt,
        qmsManifestRunId: input.qmsManifestRunId ?? null,
      });
      createdBaselineId = baseline.baselineId;
      baselineWasCreated = baseline.created;
      supersededBaselineIds = baseline.supersededBaselineIds;

      // Auto-seed the SSP & Policy Review register from the QMS release.
      // Same-txn so a released submission can never exist without its
      // register attestation. Failures here roll back the release —
      // intentional: drift between QMS release and the register is
      // exactly the problem this helper exists to prevent.
      policyReviewSeed = await seedPolicyReviewEntryFromRelease(tx, {
        organizationId: input.organizationId,
        sspDocumentId: target.sspDocumentId,
        sspDocControlSubmissionId: target.id,
        qmsDocumentNumber: mDoc.documentNumber,
        qmsSha256: sha,
        releasedAt,
      });
    });

    result.released += 1;
    if (baselineWasCreated) result.baselinesCreated += 1;

    // Audit log outside the transaction: a failed audit write must
    // not roll back the release. Mirrors the manifest-ingest pattern.
    if (baselineWasCreated && createdBaselineId) {
      try {
        await writeAuditLog({
          organizationId: input.organizationId,
          action: "ssp.release_baseline.created",
          resourceType: "ssp_release_baseline",
          resourceId: createdBaselineId,
          details: {
            ssp_document_id: target.sspDocumentId,
            ssp_doc_control_submission_id: target.id,
            qms_document_number: mDoc.documentNumber,
            qms_sha256: sha,
            qms_manifest_run_id: input.qmsManifestRunId ?? null,
            superseded_baseline_ids: supersededBaselineIds,
            released_at: releasedAt.toISOString(),
          },
        });
      } catch (err) {
        console.error(
          "[doc-control-linker] audit log write for release baseline failed:",
          err,
        );
      }
    }

    // Post-txn fan-out for the auto-seeded policy review entry:
    //   1. Audit log the seed (or duplicate-hit, for forensic traceability).
    //   2. Recompute every control whose register lane depends on
    //      policy_review_log so the dashboard reflects the new evidence
    //      without waiting for lazy on-read recomputation.
    // Both steps are best-effort. The release + register entry have
    // already committed inside the txn above; an audit-log or recompute
    // hiccup must not roll that back.
    const seed = policyReviewSeed as SeedResult | null;
    if (seed && (seed.kind === "created" || seed.kind === "duplicate")) {
      try {
        await writeAuditLog({
          organizationId: input.organizationId,
          action:
            seed.kind === "created"
              ? "governance_register.entry.auto_seeded"
              : "governance_register.entry.auto_seed_duplicate",
          resourceType: "governance_register_entry",
          resourceId: seed.entryId,
          details: {
            source: "doc_control_release",
            register_schema_id: "policy_review",
            ssp_document_id: target.sspDocumentId,
            ssp_doc_control_submission_id: target.id,
            qms_document_number: mDoc.documentNumber,
            qms_sha256: sha,
            released_at: releasedAt.toISOString(),
          },
        });
      } catch (err) {
        console.error(
          "[doc-control-linker] audit log write for policy-review seed failed:",
          err,
        );
      }

      if (seed.kind === "created") {
        try {
          const recompute = await recomputePolicyReviewAffectedControls(
            input.organizationId,
          );
          if (recompute.errors.length > 0) {
            console.error(
              "[doc-control-linker] post-seed control recompute had errors:",
              recompute.errors,
            );
          }
          console.log(
            `[doc-control-linker] post-seed recompute: ${recompute.recalculated} control(s) recalculated`,
          );
        } catch (err) {
          console.error(
            "[doc-control-linker] post-seed control recompute failed (non-blocking):",
            err,
          );
        }
      }
    } else if (seed && seed.kind === "skipped") {
      console.warn(
        `[doc-control-linker] policy-review seed skipped for ${mDoc.documentNumber}: ${seed.reason}`,
      );
    }
  }

  // Cross-version supersession: when a NEWER ssp_documents row's
  // submission gets released, mark prior versions' released rows as
  // superseded. The trigger is: if any other ssp_documents row for
  // this org has a released submission AND its versionNumber is
  // smaller than the just-released doc's versionNumber, mark its
  // released submission row as superseded.
  if (result.released > 0) {
    // Find the highest version_number with a released submission per
    // (org). Mark every other org-released row with a lower
    // version_number as superseded by the highest.
    const releasedRows = await db
      .select({
        submissionId: sspDocControlSubmissions.id,
        sspDocumentId: sspDocControlSubmissions.sspDocumentId,
        versionNumber: sspDocuments.versionNumber,
      })
      .from(sspDocControlSubmissions)
      .innerJoin(
        sspDocuments,
        eq(sspDocControlSubmissions.sspDocumentId, sspDocuments.id),
      )
      .where(
        and(
          eq(sspDocControlSubmissions.organizationId, input.organizationId),
          eq(sspDocControlSubmissions.status, "released"),
        ),
      );

    if (releasedRows.length > 1) {
      const maxVersion = Math.max(...releasedRows.map((r) => r.versionNumber));
      const winner = releasedRows.find((r) => r.versionNumber === maxVersion);
      const losers = releasedRows.filter(
        (r) => r.versionNumber < maxVersion && r.submissionId !== winner?.submissionId,
      );
      if (winner && losers.length > 0) {
        const loserIds = losers.map((l) => l.submissionId);
        await db
          .update(sspDocControlSubmissions)
          .set({
            status: "superseded",
            supersededAt: new Date(),
            supersededById: winner.submissionId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sspDocControlSubmissions.organizationId, input.organizationId),
              inArray(sspDocControlSubmissions.id, loserIds),
            ),
          );
        result.superseded += losers.length;
      }
    }
  }

  return result;
}

/**
 * Convenience: pull the released SSP entries out of a freshly-ingested
 * manifest (post-insert) and call linkReleasedSspsToSubmissions.
 *
 * The manifest ingest route currently doesn't retain the parsed
 * envelope after the transaction commits, so this helper re-reads
 * the just-inserted rows by run_id. That's slightly redundant but
 * keeps the linker independent of the ingest's internals.
 */
export async function linkFromManifestRun(
  organizationId: string,
  runId: string,
): Promise<LinkResult> {
  const rows = await db.execute<{
    document_number: string;
    sha256: string;
    released: boolean | null;
    released_at: string | null;
  }>(sql`
    SELECT document_number, sha256, released, released_at
    FROM qms_governance_manifest_documents
    WHERE organization_id = ${organizationId}
      AND run_id = ${runId}
      AND document_type = 'ssp'
  `);

  const manifestSsps: ManifestSspDoc[] = rows.map((r) => ({
    documentNumber: r.document_number,
    sha256: r.sha256,
    released: r.released ?? false,
    releasedAt: r.released_at,
  }));

  return linkReleasedSspsToSubmissions({
    organizationId,
    manifestSsps,
    qmsManifestRunId: runId,
  });
}
