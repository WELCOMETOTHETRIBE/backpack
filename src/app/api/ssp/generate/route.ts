/**
 * POST /api/ssp/generate
 *
 * Generates a new SSP version + records the single author attestation
 * for provenance. Does NOT auto-submit to MacTech Quality Doc Control
 * — that's an explicit operator action via the "Submit to Doc Control"
 * button on /dashboard/ssp.
 *
 * Why explicit Submit instead of auto-submit:
 *   - Auto-submit added a flaky failure mode where a freshly-generated
 *     SSP would land in 'queued — failed' state on every transient
 *     QMS-side issue (HTTP 409 conflict, contract drift, env-var gap).
 *     The operator hit confusion every regeneration.
 *   - Two-step flow (Generate → Submit) keeps the click cost low while
 *     making the QMS handoff explicit and defensible: the user
 *     consciously says "this version is ready for QMS review" rather
 *     than the system auto-firing on every Generate.
 *   - Submit endpoint already handles all the bridge mechanics
 *     (idempotent retry, payload validation, error surfacing). No
 *     functional regression from removing the auto-submit step.
 *
 * Flow:
 *   1. Generate SSP from canonical state — composes AG-aligned
 *      sections (CA.L2-3.12.4 [a]–[h]), pins evidence by SHA-256,
 *      canonicalizes JSON, persists to ssp_documents +
 *      ssp_section_revisions + ssp_evidence_citations. Lands in
 *      status='draft'.
 *   2. Record author attestation — single sspSignoffs row with
 *      kind='author', signature_alg='codex_author_attestation',
 *      attributed to the generating user. Provenance only; NOT an
 *      approval signature. Quality Release gating remains with QMS
 *      Reviewer / Approver / Quality Release per v2.13 page-204.
 *
 * Body (all optional):
 *   { boundaryId?: string }
 *
 * Returns 201 with:
 *   { ok, sspDocumentId, versionNumber, payloadSha256, controls*,
 *     generatedBy: { userId, displayName, email, attestedAt } }
 *
 * Auth: Admin only.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { recordAuthorAttestation } from "@/lib/ssp/author-attestation";
import { generateSsp } from "@/lib/ssp/generate";

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

  // ── 2. Record author attestation ─────────────────────────────────
  // Single row in sspSignoffs with kind='author'. Provenance only;
  // NOT an approval signature. Idempotent on (sspDocumentId, kind).
  let authorResult: Awaited<ReturnType<typeof recordAuthorAttestation>>;
  try {
    authorResult = await recordAuthorAttestation({
      organizationId: orgId,
      sspDocumentId: generated.sspDocumentId,
      payloadSha256: generated.payloadSha256,
      authorUserId: userId,
    });
  } catch (err) {
    // Author attestation failure is non-fatal — generation succeeded
    // and the operator can still trigger Submit (which records its
    // own author row if needed via the same helper).
    console.error("[ssp/generate] author attestation failed:", err);
    return NextResponse.json(
      {
        ok: true,
        ...generated,
        generatedBy: null,
        authorAttestationError:
          err instanceof Error ? err.message : String(err),
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      ...generated,
      generatedBy: {
        userId: authorResult.author.userId,
        displayName: authorResult.author.displayName,
        email: authorResult.author.email,
        attestedAt: authorResult.author.attestedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
