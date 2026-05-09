/**
 * POST /api/integrations/qms-manifest/ingest
 *
 * Receives signed `mactech-governance-manifest.v1.1` envelopes from the
 * QMS document-control service. Verifies signature + content hash,
 * stores immutably, fans out to the OIS regenerator for any
 * governance-18 controls touched. Mirrors the ISSO weekly export
 * ingest flow.
 *
 * Auth: in-body HMAC-SHA-256 signature against QMS_MANIFEST_SIGNING_SECRET.
 * No `Authorization` header — the signature travels with the data so a
 * stored manifest can be re-verified months later without holding live
 * tokens (CMMC 3.3.1 / 3.3.2 audit-record longevity).
 *
 * Idempotent on run_id: re-POSTing the same manifest is a no-op.
 *
 * Response shape:
 *   200 { status: "stored" | "already_present", run_id, controls_touched }
 *   400 schema mismatch / canonicalization failure
 *   401 signature mismatch
 *   500 internal error (DB)
 */

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import {
  organizations,
  qmsGovernanceManifests,
  qmsGovernanceManifestDocuments,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  manifestEnvelopeSchema,
  type ManifestEnvelope,
} from "@/lib/integrations/qms-manifest-schema";
import { verifyEnvelope } from "@/lib/integrations/qms-manifest-verify";
import { writeAuditLog } from "@/lib/audit";
import { regenerateOISForManifest } from "@/lib/evidence-engine/adjudication/qms-manifest-ois-bridge";
import { bridgeQmsManifestToGovernance } from "@/lib/evidence-engine/adjudication/qms-manifest-status-bridge";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";
import { linkFromManifestRun } from "@/lib/ssp/doc-control-linker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap on payload size — a manifest with 200 docs and full metadata
// shouldn't exceed ~512KB. Reject larger payloads outright to bound the
// hash + canonicalization work.
const MAX_BODY_BYTES = 1_048_576; // 1 MiB

// Coerce a date-or-iso string into a Date, returning null on
// unparseable input. Centralized so the same logic applies to
// effective_date and next_review_date.
function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  // 1. Read + size-cap the body.
  let raw: string;
  try {
    raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "manifest payload exceeds 1 MiB cap" },
        { status: 413 },
      );
    }
  } catch (err) {
    console.error("[qms-manifest-ingest] body read failed:", err);
    return NextResponse.json({ error: "could not read body" }, { status: 400 });
  }

  // 2. Parse JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  // 3. Validate shape against the v1.1 schema.
  const validated = manifestEnvelopeSchema.safeParse(parsed);
  if (!validated.success) {
    console.error(
      "[qms-manifest-ingest] schema validation failed:",
      JSON.stringify(validated.error.format()).slice(0, 500),
    );
    return NextResponse.json(
      { error: "manifest schema mismatch", details: validated.error.format() },
      { status: 400 },
    );
  }
  const envelope: ManifestEnvelope = validated.data;

  // 4. Recompute content_hash + signing_hash + verify HMAC. This is the
  //    chain-of-custody anchor — any tampering between QMS and here fails
  //    here. Treat 401 as "not from a trusted issuer" rather than 403,
  //    matching the cmmc:read endpoint's auth-failure semantics.
  const verified = verifyEnvelope(envelope);
  if (!verified.ok) {
    console.error("[qms-manifest-ingest] signature verify failed:", verified.reason);
    return NextResponse.json(
      { error: "manifest signature verification failed", reason: verified.reason },
      { status: 401 },
    );
  }

  // 5. Resolve the local codex organization. Single-tenant today: pick
  //    the org with slug='mactech', else the first row. The QMS-side org
  //    UUID is stashed in env (MACTECH_DEFAULT_ORG_ID) but does NOT match
  //    codex's organizations.id; the canonical mapping is by slug.
  const orgRow =
    (await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "mactech"))
      .limit(1))[0] ??
    (await db.select({ id: organizations.id }).from(organizations).limit(1))[0];

  if (!orgRow) {
    console.error("[qms-manifest-ingest] no organization in codex DB");
    return NextResponse.json(
      { error: "codex has no organization to file the manifest under" },
      { status: 500 },
    );
  }

  // 6. Idempotent insert. Re-POSTing the same run_id returns the existing
  //    row with status="already_present" — no error, no duplicate audit
  //    entry, no double-trigger of the OIS regenerator.
  const existing = await db
    .select({ runId: qmsGovernanceManifests.runId })
    .from(qmsGovernanceManifests)
    .where(eq(qmsGovernanceManifests.runId, envelope.run_id))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      {
        status: "already_present",
        run_id: envelope.run_id,
        controls_touched: envelope.controls_touched,
      },
      { status: 200 },
    );
  }

  // 7. Insert manifest + child docs in a single transaction so we never
  //    have a half-stored manifest the OIS regenerator might pick up
  //    asynchronously.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(qmsGovernanceManifests).values({
        runId: envelope.run_id,
        organizationId: orgRow.id,
        schemaVersion: envelope.schema,
        generatedAt: new Date(envelope.generated_at),
        generatedBy: envelope.generated_by ?? null,
        toolVersion: envelope.tool_version ?? null,
        source: envelope.source,
        reviewPeriodStart: envelope.review_period_start
          ? new Date(envelope.review_period_start)
          : null,
        reviewPeriodEnd: envelope.review_period_end
          ? new Date(envelope.review_period_end)
          : null,
        issuerService: envelope.issuer.service,
        issuerUrl: envelope.issuer.url,
        issuerClientId: envelope.issuer.client_id,
        issuerGitSha: envelope.issuer.git_sha ?? null,
        docCount: envelope.doc_count,
        controlsTouched: envelope.controls_touched,
        contentHash: envelope.content_hash,
        signingHash: envelope.signing_hash,
        signatureAlg: envelope.signature.alg,
        signatureKid: envelope.signature.kid,
        signatureValue: envelope.signature.value,
        rawEnvelope: envelope as unknown as Record<string, unknown>,
      });

      if (envelope.documents.length > 0) {
        await tx.insert(qmsGovernanceManifestDocuments).values(
          envelope.documents.map((d) => ({
            runId: envelope.run_id,
            organizationId: orgRow.id,
            documentNumber: d.document_number,
            documentName: d.document_name,
            documentType: d.document_type ?? null,
            filePath: d.file_path ?? null,
            version: d.version ?? null,
            status: d.status ?? null,
            // Coerce string-or-null dates to Date-or-null at insert time;
            // the envelope keeps strings so the content_hash stays
            // deterministic across QMS↔Codex (see qms-manifest-schema.ts).
            effectiveDate: d.effective_date
              ? toDateOrNull(d.effective_date)
              : null,
            nextReviewDate: d.next_review_date
              ? toDateOrNull(d.next_review_date)
              : null,
            sha256: d.sha256.toLowerCase(),
            fileSizeBytes: d.file_size_bytes ?? null,
            controlsMapped: d.controls_mapped,
            // v1.2 fields. released_at stays as a string (ISO or
            // YYYY-MM-DD) for hashing-determinism reasons.
            released: d.released ?? false,
            releasedAt: d.released_at ?? null,
            signatures: d.signatures ?? [],
          })),
        );
      }

      // ── Retire-on-absence ─────────────────────────────────────────
      // Stamp retired_at on the most-recent row of any (org,
      // document_number) whose document_number is not in this
      // manifest. The library view at /dashboard/documents filters
      // retired_at IS NULL so docs deleted/retired on the QMS side
      // stop polluting it.
      //
      // Idempotent on re-ingest of the same manifest: docs in the
      // current envelope have a fresh row with run_id = this run, so
      // the `qgmd.run_id <> ${envelope.run_id}` predicate excludes
      // them from being retired here.
      await tx.execute(sql`
        UPDATE qms_governance_manifest_documents
        SET retired_at = NOW()
        WHERE id IN (
          SELECT DISTINCT ON (q.document_number) q.id
          FROM qms_governance_manifest_documents q
          JOIN qms_governance_manifests qm ON qm.run_id = q.run_id
          WHERE q.organization_id = ${orgRow.id}
          ORDER BY q.document_number, qm.received_at DESC
        )
        AND run_id <> ${envelope.run_id}
        AND retired_at IS NULL
      `);
    });
  } catch (err) {
    console.error("[qms-manifest-ingest] DB insert failed:", err);
    return NextResponse.json(
      { error: "failed to persist manifest" },
      { status: 500 },
    );
  }

  // 8. Append-only audit log entry. Mirrors the ISSO ingest pattern.
  try {
    await writeAuditLog({
      organizationId: orgRow.id,
      action: "cmmc.qms_manifest.ingested",
      resourceType: "qms_governance_manifest",
      resourceId: envelope.run_id,
      details: {
        schema: envelope.schema,
        issuer: envelope.issuer.client_id,
        doc_count: envelope.doc_count,
        controls_touched_count: envelope.controls_touched.length,
        signature_kid: envelope.signature.kid,
      },
    });
  } catch (err) {
    // Audit-log failure shouldn't roll back the ingest. Log loudly.
    console.error("[qms-manifest-ingest] audit log write failed:", err);
  }

  // 9a. Synchronous bridge: UPSERT QMS docs into the codex-native
  //     governance_documents + governance_document_control_links tables
  //     so calculateControlStatus.hasApprovedGovDocs sees them, then
  //     recalculate every affected control_record's implementation_status.
  //     This is what flips controls from Not Started → In Progress →
  //     Implemented on the dashboard after a QMS push. Done synchronously
  //     so the HTTP response confirms control flip happened.
  try {
    const bridgeResult = await bridgeQmsManifestToGovernance({
      orgId: orgRow.id,
      envelope,
    });
    if (bridgeResult.errors.length > 0) {
      console.error(
        "[qms-manifest-ingest] status bridge had non-fatal errors:",
        bridgeResult.errors,
      );
    }
    console.log(
      `[qms-manifest-ingest] status bridge: ${bridgeResult.documentsUpserted} docs, ${bridgeResult.linksUpserted} links, ${bridgeResult.controlRecordsRecalculated} controls recalculated`,
    );
  } catch (err) {
    // Bridge failures are non-fatal — the manifest is still stored and
    // an admin can re-trigger by re-pushing. Log loudly.
    console.error(
      "[qms-manifest-ingest] status bridge failed (non-blocking):",
      err,
    );
  }

  // 9a-bis. SSP Doc Control round-trip (Phase 3-Codex-inbound).
  //         For each manifest entry with document_type='ssp', match
  //         back to the corresponding ssp_doc_control_submissions row
  //         (status='submitted', submitted_payload_sha256 == sha256)
  //         and flip it to 'released'. Mark prior release rows for the
  //         same SSP version as 'superseded'.
  //
  //         Synchronous + best-effort: the HTTP response should
  //         confirm the DocControlPanel will reflect 'released' on the
  //         next page load, but a linker failure must NOT roll back
  //         the manifest itself.
  try {
    const linkResult = await linkFromManifestRun(orgRow.id, envelope.run_id);
    if (linkResult.released > 0 || linkResult.superseded > 0) {
      console.log(
        `[qms-manifest-ingest] doc-control linker: ${linkResult.released} released, ${linkResult.superseded} superseded, ${linkResult.unmatched.length} unmatched (of ${linkResult.considered} ssp-typed manifest docs)`,
      );
    }
    if (linkResult.unmatched.length > 0) {
      console.warn(
        `[qms-manifest-ingest] doc-control linker: ${linkResult.unmatched.length} released SSP(s) had no matching Codex submission`,
        linkResult.unmatched,
      );
    }
  } catch (err) {
    console.error(
      "[qms-manifest-ingest] doc-control linker failed (non-blocking):",
      err,
    );
  }

  // 9b. Async fan-out: regenerate OIS for any governance-18 controls
  //    touched, and refresh mostRecentEvidenceAt so freshness scoring
  //    sees this manifest's evidence as fresh. Awaited inside a
  //    setImmediate-style background tick so the HTTP response returns
  //    quickly and an OIS hiccup doesn't fail the ingest.
  //
  //    Phase B trigger fires AFTER OIS regen because the canonical
  //    rescore reads OIS state when computing per-objective verdicts
  //    in future iterations. Same best-effort, fire-and-forget shape.
  void Promise.resolve().then(async () => {
    try {
      await regenerateOISForManifest({
        orgId: orgRow.id,
        controlsTouched: envelope.controls_touched,
        manifestRunId: envelope.run_id,
        manifestGeneratedAt: new Date(envelope.generated_at),
      });
    } catch (err) {
      console.error(
        "[qms-manifest-ingest] OIS regen failed (non-blocking):",
        err,
      );
    }
    try {
      await scoreControlsAffectedBy({
        organizationId: orgRow.id,
        triggerSource: "qms_manifest_ingested",
        controlIds: envelope.controls_touched,
      });
    } catch (err) {
      console.error(
        "[qms-manifest-ingest] canonical rescore failed (non-blocking):",
        err,
      );
    }
  });

  return NextResponse.json(
    {
      status: "stored",
      run_id: envelope.run_id,
      controls_touched: envelope.controls_touched,
    },
    { status: 200 },
  );
}
