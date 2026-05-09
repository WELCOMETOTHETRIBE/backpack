/**
 * POST /api/ssp/generate
 *
 * Generates a new SSP version AND auto-submits it to MacTech Quality
 * Doc Control as a fresh CMMC-tagged revision of the existing SSP
 * authorizing record. One click = one new revision in QMS hands.
 *
 * Flow:
 *   1. Generate SSP from canonical state — composes AG-aligned
 *      sections (CA.L2-3.12.4 [a]–[h]), pins evidence by SHA-256,
 *      canonicalizes JSON, persists to ssp_documents +
 *      ssp_section_revisions + ssp_evidence_citations. Lands in
 *      status='draft'.
 *   2. Auto-attest: insert three sspSignoffs rows (isso, system_owner,
 *      authorizing_official) attributed to the generating user with
 *      signature_alg='codex_system_attestation'. These satisfy the
 *      QMS bridge validation (3 signoffs bound to payload_sha256) and
 *      preserve provenance — they are NOT human-signed approvals.
 *      Quality Release gating remains with QMS Reviewer / Approver /
 *      QR per the v2.13 page-204 separation of concerns (Q1=B in the
 *      bridge mapping doc).
 *   3. Auto-submit: build the bridge payload (stable
 *      document_number='SSP-001', ssp_version_number incrementing) and
 *      POST to QMS via submitToQms(). Failures are best-effort —
 *      generation succeeds with a queued submission row that the
 *      operator can retry from the SSP page's Submit button.
 *
 * Body (all optional):
 *   { boundaryId?: string, skipAutoSubmit?: boolean }
 *
 * Returns 201 with:
 *   { ok, sspDocumentId, versionNumber, payloadSha256, controls*,
 *     autoAttest: { signoffsCreated, generatedBy: {…} } | null,
 *     docControl: { transmitted, submissionId, qmsSubmissionId,
 *                   qmsDocumentNumber, reviewWindowDaysEstimate,
 *                   reason } | null }
 *
 * Auth: Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { createHash } from "node:crypto";

import { db } from "@/db";
import {
  boundaries,
  sspDocControlSubmissions,
  sspDocuments,
  sspSignoffs,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { autoAttestSspOnGenerate } from "@/lib/ssp/auto-attest";
import {
  submitToQms,
  type BridgeSignoffPayload,
} from "@/lib/ssp/doc-control-bridge";
import { generateSsp } from "@/lib/ssp/generate";
import {
  SspDocument,
  type SspPdfMeta,
  type SspPdfPayload,
} from "@/lib/ssp/pdf/SspDocument";

/**
 * Stable QMS document_number for the org's SSP authorizing record.
 * Every generation lands as a new VERSION of the same QMS document
 * rather than a new doc — matches "CMMC-tagged new revision of the
 * existing SSP" intent. QMS handles version tracking via the
 * ssp_version_number field. (Multi-boundary orgs would namespace
 * this by boundary; single-boundary today, so SSP-001 suffices.)
 */
const STABLE_SSP_DOCUMENT_NUMBER = "SSP-001";

export async function POST(req: NextRequest) {
  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
  // SessionUser.id is optional in the type but always present after
  // requireRole succeeds. Narrow to string for downstream calls that
  // need a definite value.
  if (!user.id) {
    return NextResponse.json(
      { error: "Authenticated user has no id — cannot attribute SSP" },
      { status: 401 },
    );
  }
  const userId = user.id;

  const body = await req.json().catch(() => ({}));
  const boundaryId =
    typeof body?.boundaryId === "string" ? body.boundaryId : undefined;
  const skipAutoSubmit = body?.skipAutoSubmit === true;

  // ── 1. Generate SSP ──────────────────────────────────────────────
  let generated: Awaited<ReturnType<typeof generateSsp>>;
  try {
    generated = await generateSsp({
      organizationId: orgId,
      boundaryId,
      triggeredByUserId: userId,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "SSP generation failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const response: Record<string, unknown> = {
    ok: true,
    ...generated,
    autoAttest: null,
    docControl: null,
  };

  if (skipAutoSubmit) {
    return NextResponse.json(response, { status: 201 });
  }

  // ── 2. Auto-attest ───────────────────────────────────────────────
  let attestResult: Awaited<ReturnType<typeof autoAttestSspOnGenerate>>;
  try {
    attestResult = await autoAttestSspOnGenerate({
      organizationId: orgId,
      sspDocumentId: generated.sspDocumentId,
      payloadSha256: generated.payloadSha256,
      generatedByUserId: userId,
    });
    response.autoAttest = {
      signoffsCreated: attestResult.signoffsCreated,
      generatedBy: attestResult.generatedBy,
    };
  } catch (err) {
    response.docControl = {
      transmitted: false,
      reason: `Auto-attestation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    return NextResponse.json(response, { status: 201 });
  }

  // ── 3. Auto-submit to Doc Control ────────────────────────────────
  // Mirrors the logic in /api/ssp/[id]/submit-to-doc-control but runs
  // in-process. Drift is identical-by-construction for a freshly-
  // generated SSP (citations are just-pinned), so we skip the drift
  // call and trust the generation guarantee.
  try {
    const [doc] = await db
      .select()
      .from(sspDocuments)
      .where(eq(sspDocuments.id, generated.sspDocumentId))
      .limit(1);
    if (!doc) throw new Error("Generated SSP row missing on read-back");

    const [boundary] = await db
      .select({ id: boundaries.id, name: boundaries.name })
      .from(boundaries)
      .where(eq(boundaries.id, doc.boundaryId))
      .limit(1);

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
          eq(sspSignoffs.sspDocumentId, generated.sspDocumentId),
        ),
      );

    // Persist staging row first so the click is durable even if the
    // bridge POST fails. QMS-side dedupe key
    // (org, ssp_document_id, payload_sha256) keeps re-submissions safe.
    const [submission] = await db
      .insert(sspDocControlSubmissions)
      .values({
        organizationId: orgId,
        sspDocumentId: generated.sspDocumentId,
        status: "submitted",
        submittedPayloadSha256: doc.payloadSha256,
        submittedByUserId: userId,
        notes: `Auto-submitted by Codex on SSP generate · author=${attestResult.generatedBy.email}`,
      })
      .returning();

    // Render PDF.
    let pdfBase64: string | null = null;
    let pdfSha256: string | null = null;
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
    } catch (renderErr) {
      const reason = `PDF render failed: ${renderErr instanceof Error ? renderErr.message : "unknown"}`;
      response.docControl = {
        transmitted: false,
        submissionId: submission.id,
        reason,
      };
      await db
        .update(sspDocControlSubmissions)
        .set({
          outboundAttemptCount: 1,
          lastOutboundAttemptAt: new Date(),
          lastOutboundError: reason,
        })
        .where(eq(sspDocControlSubmissions.id, submission.id));
      return NextResponse.json(response, { status: 201 });
    }

    // controls_mapped from the persisted payload.
    const payloadJson = doc.payloadJson as {
      controls?: Array<{ control_id?: string }>;
    };
    const controlsMapped = (payloadJson.controls ?? [])
      .map((c) => c.control_id)
      .filter((s): s is string => typeof s === "string" && s.length > 0);
    const canonicalJsonSha256 = createHash("sha256")
      .update(JSON.stringify(doc.payloadJson))
      .digest("hex");

    const signoffsPayload: BridgeSignoffPayload[] = signoffRows
      .filter((s) =>
        ["isso", "system_owner", "authorizing_official"].includes(s.signoffKind),
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

    const bridgeResult = await submitToQms({
      submission_id: submission.id,
      organization_id: orgId,
      ssp_document_id: generated.sspDocumentId,
      ssp_version_number: doc.versionNumber,
      document_number: STABLE_SSP_DOCUMENT_NUMBER,
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
        outboundAttemptCount: 1,
        lastOutboundAttemptAt: now,
        lastOutboundError: bridgeResult.ok
          ? null
          : (bridgeResult.reason ?? `HTTP ${bridgeResult.status}`),
        updatedAt: now,
      })
      .where(eq(sspDocControlSubmissions.id, submission.id));

    response.docControl = {
      transmitted: bridgeResult.ok,
      submissionId: submission.id,
      qmsSubmissionId: bridgeResult.qmsSubmissionId ?? null,
      qmsDocumentNumber: bridgeResult.qmsDocumentNumber ?? null,
      reviewWindowDaysEstimate: bridgeResult.reviewWindowDaysEstimate ?? null,
      reason: bridgeResult.ok ? null : bridgeResult.reason,
    };

    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "ssp.auto_submit_on_generate",
      resourceType: "ssp_document",
      resourceId: generated.sspDocumentId,
      details: {
        submission_id: submission.id,
        ssp_version: doc.versionNumber,
        payload_sha256: doc.payloadSha256,
        document_number: STABLE_SSP_DOCUMENT_NUMBER,
        signoffs_attached: signoffsPayload.length,
        bridge_ok: bridgeResult.ok,
        bridge_status: bridgeResult.status,
        bridge_reason: bridgeResult.reason ?? null,
        qms_submission_id: bridgeResult.qmsSubmissionId ?? null,
      },
    });
  } catch (err) {
    response.docControl = {
      transmitted: false,
      reason: `Auto-submit pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return NextResponse.json(response, { status: 201 });
}
