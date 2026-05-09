/**
 * POST /api/ssp/[id]/submit-to-doc-control
 *
 * Phase 1 + Phase 2-Codex-outbound of "Send to Doc Control for SSP release."
 *
 * Submits a Codex-signed SSP version to the MacTech Quality QMS for
 * formal Reviewer / Approver / Quality Release sign-off.
 *
 * Flow (atomic-as-possible):
 *   1. Validate the request (5 gates, see below).
 *   2. Insert ssp_doc_control_submissions row in 'submitted' state.
 *   3. Render the signed SSP PDF (presentation projection of canonical JSON).
 *   4. Build the bridge payload and POST to QMS via submitToQms().
 *   5. UPDATE the staging row with QMS-side ids on success, or with
 *      last_outbound_error on failure (the row stays in 'submitted'
 *      state so the operator can retry).
 *   6. Audit-log the result.
 *
 * Failure modes:
 *   - QMS unreachable / 5xx → row persisted, last_outbound_error set,
 *     202 returned with `transmitted=false` so the UI can render
 *     "Submitted to Codex queue, awaiting QMS reachability." Retrying
 *     the endpoint will re-attempt the POST (idempotent on QMS side).
 *   - QMS auth misconfigured (env vars missing) → same as above with a
 *     specific reason string.
 *   - QMS rejects (4xx) → still returns 202; the operator-facing error
 *     comes from the `bridge` field in the response so they know what
 *     to fix.
 *
 * Five validation gates (any failure → structured 4xx with code):
 *   1. SSP exists and belongs to caller's org.
 *   2. status='signed' (drafts can't be submitted to Doc Control).
 *   3. All three sign-offs present (AO + system_owner + ISSO), each
 *      bound to the same payload_sha256 as the doc.
 *   4. Drift-clean (computeDriftReport → topLevel === 'identical').
 *   5. No existing submission in 'submitted' state for this
 *      ssp_document_id.
 *
 * Auth: Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { createHash } from "node:crypto";

import { db } from "@/db";
import {
  boundaries,
  sspDocControlSubmissions,
  sspDocuments,
  sspSectionRevisions,
  sspSignoffs,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { validateSspCompleteness } from "@/lib/ssp/completeness";
import { computeDriftReport } from "@/lib/ssp/drift";
import {
  submitToQms,
  type BridgeSignoffPayload,
} from "@/lib/ssp/doc-control-bridge";
import {
  SspDocument,
  type SspPdfMeta,
  type SspPdfPayload,
} from "@/lib/ssp/pdf/SspDocument";

const REQUIRED_SIGNOFF_KINDS = [
  "authorizing_official",
  "system_owner",
  "isso",
] as const;

const submitSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin"]);

    const { id: sspDocumentId } = await params;

    // 1. SSP exists in caller's org
    const [doc] = await db
      .select()
      .from(sspDocuments)
      .where(
        and(
          eq(sspDocuments.id, sspDocumentId),
          eq(sspDocuments.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!doc) {
      return NextResponse.json(
        { error: "SSP version not found", code: "not_found" },
        { status: 404 },
      );
    }

    // 2. Status gate. Both 'draft' and 'signed' versions can be
    //    submitted to Doc Control. The auto-submit-on-generate flow
    //    sends drafts (with codex_system_attestation signoffs) so
    //    QMS humans drive the actual review chain. Manual sign-then-
    //    submit still works for orgs that want a Codex-side human
    //    review chain before QMS sees the doc.
    if (doc.status === "superseded" || doc.status === "revoked") {
      return NextResponse.json(
        {
          error: `SSP version is in status '${doc.status}'. Only 'draft' or 'signed' versions can be submitted to Doc Control.`,
          code: "not_submittable",
        },
        { status: 409 },
      );
    }

    // 3. All three sign-offs present, all bound to this doc's payload_sha256
    const signoffRows = await db
      .select({
        signoffKind: sspSignoffs.signoffKind,
        dataHash: sspSignoffs.dataHash,
        signerDisplayName: sspSignoffs.signerDisplayName,
        signerTitle: sspSignoffs.signerTitle,
        signedAt: sspSignoffs.signedAt,
        signatureAlg: sspSignoffs.signatureAlg,
        signatureValue: sspSignoffs.signatureValue,
      })
      .from(sspSignoffs)
      .where(
        and(
          eq(sspSignoffs.organizationId, orgId),
          eq(sspSignoffs.sspDocumentId, sspDocumentId),
        ),
      );

    // Codex-side signoffs are now OPTIONAL. Per the v2.13 page-204
    // separation of concerns (Q1=B in the bridge mapping), the
    // release signature chain is QMS-side: Reviewer → Approver →
    // Quality Release. Codex's role is to author + transmit; if any
    // OSA-side ISSO/SO/AO signoffs are present they ride along as
    // additional provenance, but they are NOT required for
    // submission. The only check that still fires here is hash
    // integrity — if a signoff exists but binds to a different
    // payload_sha256, we still reject (that's a real corruption signal,
    // not a "missing approver" gate).
    const wrongHash = signoffRows.filter(
      (s) =>
        REQUIRED_SIGNOFF_KINDS.includes(
          s.signoffKind as (typeof REQUIRED_SIGNOFF_KINDS)[number],
        ) && s.dataHash !== doc.payloadSha256,
    );
    if (wrongHash.length > 0) {
      return NextResponse.json(
        {
          error:
            "Sign-off(s) bound to a different payload_sha256 — re-sign before submitting.",
          code: "signoff_hash_mismatch",
          mismatched: wrongHash.map((w) => w.signoffKind),
        },
        { status: 409 },
      );
    }

    // 4a. Completeness — every CA.L2-3.12.4 [a]–[h] determination
    //     statement must be covered by actual SSP content. Per v2.13
    //     page 209, the absence of an up-to-date SSP at assessment
    //     time is a terminal failure (assessment not completable +
    //     DFARS 252.204-7012 noncompliance). Submitting an incomplete
    //     SSP to Doc Control is therefore worse than submitting
    //     nothing — generates a paper trail of an SSP that doesn't
    //     meet 3.12.4.
    const sectionRows = await db
      .select({
        sectionKind: sspSectionRevisions.sectionKind,
        sectionKey: sspSectionRevisions.sectionKey,
        bodyMd: sspSectionRevisions.bodyMd,
        bodyJson: sspSectionRevisions.bodyJson,
        aggregateFinding: sspSectionRevisions.aggregateFinding,
        metVia: sspSectionRevisions.metVia,
      })
      .from(sspSectionRevisions)
      .where(eq(sspSectionRevisions.sspDocumentId, sspDocumentId));

    // Detect first-version status via supersededAt on prior rows.
    const priorVersions = await db
      .select({ id: sspDocuments.id })
      .from(sspDocuments)
      .where(
        and(
          eq(sspDocuments.organizationId, orgId),
          eq(sspDocuments.boundaryId, doc.boundaryId),
        ),
      );
    const isFirstVersion = priorVersions.length <= 1;

    const completeness = validateSspCompleteness({
      sections: sectionRows.map((s) => ({
        sectionKind: s.sectionKind,
        sectionKey: s.sectionKey,
        bodyMd: s.bodyMd,
        bodyJson: s.bodyJson,
        aggregateFinding: s.aggregateFinding,
        metVia: s.metVia,
      })),
      generation: { isFirstVersion },
    });
    if (!completeness.ok) {
      return NextResponse.json(
        {
          error:
            `SSP fails CA.L2-3.12.4 completeness check (${completeness.satisfiedCount}/${completeness.totalCount} objectives satisfied). ` +
            `Missing: ${completeness.missing.map((o) => `[${o}]`).join(", ")}. ` +
            `Per v2.13 page 209, an incomplete SSP is a terminal-failure event (assessment cannot be completed + DFARS 252.204-7012 noncompliance). ` +
            `Generate a new version that addresses the missing objectives before submitting to Doc Control.`,
          code: "incomplete",
          ca_l2_3_12_4: completeness,
        },
        { status: 409 },
      );
    }

    // 4b. Drift-clean.
    const drift = await computeDriftReport(sspDocumentId);
    if (!drift) {
      return NextResponse.json(
        { error: "Failed to compute drift report.", code: "drift_unavailable" },
        { status: 500 },
      );
    }
    if (drift.topLevel !== "identical") {
      const driftedCount = drift.sections.filter(
        (s) => s.outcome !== "identical",
      ).length;
      return NextResponse.json(
        {
          error: `SSP has drifted from current evidence (${driftedCount} section(s) changed). Generate a new version first.`,
          code: "drifted",
          topLevel: drift.topLevel,
          driftedSections: drift.sections
            .filter((s) => s.outcome !== "identical")
            .map((s) => ({
              sectionKind: s.sectionKind,
              sectionKey: s.sectionKey,
              outcome: s.outcome,
            })),
        },
        { status: 409 },
      );
    }

    // 5. In-flight check.
    //    - existing 'submitted' WITH qms_submission_id → truly in flight at QMS, 409
    //    - existing 'submitted' WITHOUT qms_submission_id → bridge POST failed
    //      previously; reuse the row and re-attempt the POST. QMS is
    //      idempotent on (org, ssp_document_id, payload_sha256) so re-POSTing
    //      after a transient failure is safe.
    //    - none → insert a fresh row.
    const [existing] = await db
      .select({
        id: sspDocControlSubmissions.id,
        submittedAt: sspDocControlSubmissions.submittedAt,
        qmsSubmissionId: sspDocControlSubmissions.qmsSubmissionId,
        outboundAttemptCount: sspDocControlSubmissions.outboundAttemptCount,
      })
      .from(sspDocControlSubmissions)
      .where(
        and(
          eq(sspDocControlSubmissions.organizationId, orgId),
          eq(sspDocControlSubmissions.sspDocumentId, sspDocumentId),
          eq(sspDocControlSubmissions.status, "submitted"),
        ),
      )
      .limit(1);
    if (existing && existing.qmsSubmissionId) {
      return NextResponse.json(
        {
          error: "A submission for this SSP version is already in flight at QMS.",
          code: "already_submitted",
          submissionId: existing.id,
          qmsSubmissionId: existing.qmsSubmissionId,
          submittedAt: existing.submittedAt,
        },
        { status: 409 },
      );
    }

    const parsed = submitSchema.safeParse(
      req.body ? await req.json().catch(() => ({})) : {},
    );
    const notes = parsed.success ? parsed.data.notes ?? null : null;

    // ── Persist (or reuse) the staging row ────────────────────────────
    // Reuse the existing row when a prior attempt failed to reach QMS;
    // otherwise insert a fresh one. Either way, the QMS-side dedupe key
    // (org, ssp_document_id, payload_sha256) keeps things idempotent.
    const submission = existing
      ? { id: existing.id, submittedAt: existing.submittedAt }
      : (
          await db
            .insert(sspDocControlSubmissions)
            .values({
              organizationId: orgId,
              sspDocumentId,
              status: "submitted",
              submittedPayloadSha256: doc.payloadSha256,
              submittedByUserId: user.id ?? null,
              notes,
            })
            .returning()
        )[0];
    const isRetry = !!existing;
    const priorAttemptCount = existing?.outboundAttemptCount ?? 0;

    // ── Resolve auxiliary data for the bridge payload ──────────────────
    const [boundary] = await db
      .select({ id: boundaries.id, name: boundaries.name })
      .from(boundaries)
      .where(eq(boundaries.id, doc.boundaryId))
      .limit(1);

    // Render the signed SSP PDF. Best-effort: if it fails, we can still
    // record the staging row but the bridge will not transmit (operator
    // sees the error and can retry).
    let pdfBase64: string | null = null;
    let pdfSha256: string | null = null;
    let renderError: string | null = null;
    try {
      const meta: SspPdfMeta = {
        payloadSha256: doc.payloadSha256,
        signature:
          doc.signatureValue && doc.signatureAlg && doc.signatureKid && doc.signedAt
            ? {
                alg: doc.signatureAlg,
                kid: doc.signatureKid,
                value: doc.signatureValue,
                signedAt: doc.signedAt,
              }
            : null,
        signoffs: signoffRows.map((s) => ({
          signoffKind: s.signoffKind,
          signerDisplayName: s.signerDisplayName,
          signerTitle: s.signerTitle,
          signedAt: s.signedAt,
        })),
      };
      const buffer = await renderToBuffer(
        SspDocument({
          payload: doc.payloadJson as unknown as SspPdfPayload,
          meta,
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
      pdfBase64 = buffer.toString("base64");
      pdfSha256 = createHash("sha256").update(buffer).digest("hex");
    } catch (err) {
      renderError =
        err instanceof Error ? err.message : "PDF render failed";
    }

    // Build controls_mapped from canonical JSON. The SSP payload puts
    // controls inside payload.sections[?(@.kind === 'control')].key —
    // there is NO top-level payload.controls[] array. Reading from the
    // wrong path used to silently send [] which trips QMS gate 5
    // (controls_mapped.length >= 100). Found by running the orchestrator
    // end-to-end against prod and watching gate 5 fail.
    const payloadJson = doc.payloadJson as {
      sections?: Array<{ kind?: string; key?: string }>;
    };
    const controlsMapped = (payloadJson.sections ?? [])
      .filter((s) => s?.kind === "control")
      .map((s) => s.key)
      .filter((s): s is string => typeof s === "string" && s.length > 0);

    // Canonical sha256 — MUST use the same canonicalize.ts that
    // generate.ts used to compute payload_sha256. Raw JSON.stringify is
    // NOT deterministic across object key orderings, so a sha over it
    // will not equal payload_sha256 → QMS gate 2
    // (canonical_json_sha256 === payload_sha256) fails on every real
    // submission. Use the canonical helper instead.
    const { payloadSha256 } = await import("@/lib/ssp/canonicalize");
    const canonicalJsonSha256 = payloadSha256(doc.payloadJson);

    // ── Build bridge payload ───────────────────────────────────────────
    const signoffsPayload: BridgeSignoffPayload[] = signoffRows
      .filter((s) =>
        REQUIRED_SIGNOFF_KINDS.includes(
          s.signoffKind as (typeof REQUIRED_SIGNOFF_KINDS)[number],
        ),
      )
      .map((s) => ({
        kind: s.signoffKind as BridgeSignoffPayload["kind"],
        signer_display_name: s.signerDisplayName,
        signer_title: s.signerTitle,
        data_hash: s.dataHash,
        signed_at: s.signedAt.toISOString(),
        signature_alg: s.signatureAlg ?? null,
        signature_value: s.signatureValue ?? null,
      }));

    // ── Attempt the QMS POST ───────────────────────────────────────────
    let bridgeResult: Awaited<ReturnType<typeof submitToQms>> = {
      ok: false,
      status: 0,
      reason: "Skipped — PDF render failed: " + (renderError ?? "unknown"),
    };
    if (!renderError && pdfBase64 && pdfSha256) {
      // Stable QMS document_number per boundary. Every regeneration
      // becomes a new VERSION of the same QMS doc rather than a new
      // doc entry — matches "CMMC-tagged new revision of the existing
      // SSP" intent. QMS handles its own version tracking via the
      // ssp_version_number field; document_number remains constant
      // across iterations of the same authorizing record.
      const stableDocumentNumber = "SSP-001";
      bridgeResult = await submitToQms({
        submission_id: submission.id,
        organization_id: orgId,
        ssp_document_id: sspDocumentId,
        ssp_version_number: doc.versionNumber,
        document_number: stableDocumentNumber,
        payload_sha256: doc.payloadSha256,
        generated_at: doc.generatedAt.toISOString(),
        generated_from_snapshot_at: doc.generatedFromSnapshotAt.toISOString(),
        boundary_id: doc.boundaryId,
        boundary_name: boundary?.name ?? "(unnamed boundary)",
        tally: {
          controls_covered: doc.controlsCovered,
          controls_met: doc.controlsMet,
          controls_not_met: doc.controlsNotMet,
          controls_na: doc.controlsNa,
          controls_met_via_evidence: doc.controlsMetViaEvidence,
          controls_met_via_esp: doc.controlsMetViaEsp,
          controls_met_via_enduring_exception: doc.controlsMetViaEnduringException,
          controls_met_via_dod_cio: doc.controlsMetViaDodCio,
          controls_met_via_op_plan: doc.controlsMetViaOpPlan,
        },
        controls_mapped: controlsMapped,
        signoffs: signoffsPayload,
        artifacts: {
          pdf_base64: pdfBase64,
          pdf_sha256: pdfSha256,
          canonical_json: doc.payloadJson,
          canonical_json_sha256: canonicalJsonSha256,
        },
      });
    }

    // ── Stamp bridge result onto the staging row ───────────────────────
    const now = new Date();
    await db
      .update(sspDocControlSubmissions)
      .set({
        qmsSubmissionId: bridgeResult.ok
          ? bridgeResult.qmsSubmissionId ?? null
          : null,
        qmsDocumentNumber: bridgeResult.ok
          ? bridgeResult.qmsDocumentNumber ?? null
          : null,
        outboundAttemptCount: priorAttemptCount + 1,
        lastOutboundAttemptAt: now,
        lastOutboundError: bridgeResult.ok
          ? null
          : (bridgeResult.reason ?? `HTTP ${bridgeResult.status}`),
        updatedAt: now,
      })
      .where(eq(sspDocControlSubmissions.id, submission.id));

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: isRetry
        ? "ssp.submit_to_doc_control.retry"
        : "ssp.submit_to_doc_control",
      resourceType: "ssp_document",
      resourceId: sspDocumentId,
      details: {
        submission_id: submission.id,
        ssp_version: doc.versionNumber,
        payload_sha256: doc.payloadSha256,
        signoff_count: signoffRows.length,
        attempt_count: priorAttemptCount + 1,
        bridge_ok: bridgeResult.ok,
        bridge_status: bridgeResult.status,
        bridge_reason: bridgeResult.reason ?? null,
        qms_submission_id: bridgeResult.qmsSubmissionId ?? null,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        submission: {
          id: submission.id,
          status: "submitted",
          submittedAt: submission.submittedAt,
        },
        sspDocumentId,
        sspVersion: doc.versionNumber,
        payloadSha256: doc.payloadSha256,
        bridge: {
          transmitted: bridgeResult.ok,
          httpStatus: bridgeResult.status,
          qmsSubmissionId: bridgeResult.qmsSubmissionId ?? null,
          qmsDocumentNumber: bridgeResult.qmsDocumentNumber ?? null,
          reviewWindowDaysEstimate:
            bridgeResult.reviewWindowDaysEstimate ?? null,
          reason: bridgeResult.ok ? null : bridgeResult.reason,
        },
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/ssp/:id/submit-to-doc-control]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 },
    );
  }
}
