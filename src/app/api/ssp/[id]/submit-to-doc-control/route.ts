/**
 * POST /api/ssp/[id]/submit-to-doc-control
 *
 * Phase 1 of "Send to Doc Control for SSP release."
 *
 * Submits a Codex-signed SSP version to the MacTech Quality QMS for
 * formal release. Phase 1 records the submission row only — the
 * outbound HTTP bridge to QMS lands in Phase 2, and the inbound linker
 * (matching the released QMS doc back to this row) lands in Phase 3.
 *
 * Gates (any failure → 4xx with reason):
 *   1. SSP exists and belongs to caller's org.
 *   2. status='signed' (drafts can't be submitted to Doc Control).
 *   3. All three sign-offs present: authorizing_official, system_owner,
 *      isso, each bound to the same payload_sha256 as the doc.
 *   4. Drift-clean (computeDriftReport → topLevel === 'identical').
 *      A drifting SSP shouldn't be released; the operator must
 *      regenerate first.
 *   5. No existing submission in 'submitted' state for this
 *      ssp_document_id (enforced by partial unique index on the
 *      table; we surface the duplicate explicitly here).
 *
 * Auth: Admin only.
 *
 * Body: { notes?: string }
 *
 * Returns: { submission, sspDocumentId, payloadSha256, status }
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  sspDocControlSubmissions,
  sspDocuments,
  sspSignoffs,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { computeDriftReport } from "@/lib/ssp/drift";

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

    // 2. status='signed' gate. Doc Control releases only the
    //    cryptographically-bound version.
    if (doc.status !== "signed") {
      return NextResponse.json(
        {
          error:
            `SSP version is in status '${doc.status}'. Only 'signed' versions can be submitted to Doc Control.`,
          code: "not_signed",
        },
        { status: 409 },
      );
    }

    // 3. All three sign-offs present, all bound to this doc's payload_sha256
    const signoffs = await db
      .select({
        signoffKind: sspSignoffs.signoffKind,
        dataHash: sspSignoffs.dataHash,
        signerDisplayName: sspSignoffs.signerDisplayName,
        signedAt: sspSignoffs.signedAt,
      })
      .from(sspSignoffs)
      .where(
        and(
          eq(sspSignoffs.organizationId, orgId),
          eq(sspSignoffs.sspDocumentId, sspDocumentId),
        ),
      );

    const presentKinds = new Set(signoffs.map((s) => s.signoffKind));
    const missingKinds = REQUIRED_SIGNOFF_KINDS.filter(
      (k) => !presentKinds.has(k),
    );
    if (missingKinds.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required sign-off(s): ${missingKinds.join(", ")}.`,
          code: "missing_signoffs",
          missing: missingKinds,
          present: Array.from(presentKinds),
        },
        { status: 409 },
      );
    }
    const wrongHash = signoffs.filter(
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

    // 4. Drift-clean. If any cited evidence row no longer matches its
    //    pinned SHA, we'd be releasing a stale narrative.
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
          error:
            `SSP has drifted from current evidence (${driftedCount} section(s) changed). ` +
            `Generate a new version that captures fresh evidence before submitting to Doc Control.`,
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

    // 5. No in-flight submission already (partial unique index enforces
    //    this at the DB level too, but we surface a clean error here).
    const [existing] = await db
      .select({
        id: sspDocControlSubmissions.id,
        submittedAt: sspDocControlSubmissions.submittedAt,
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
    if (existing) {
      return NextResponse.json(
        {
          error: "A submission for this SSP version is already in flight.",
          code: "already_submitted",
          submissionId: existing.id,
          submittedAt: existing.submittedAt,
        },
        { status: 409 },
      );
    }

    const parsed = submitSchema.safeParse(
      req.body ? await req.json().catch(() => ({})) : {},
    );
    const notes = parsed.success ? parsed.data.notes ?? null : null;

    // Insert the submission row.
    const [submission] = await db
      .insert(sspDocControlSubmissions)
      .values({
        organizationId: orgId,
        sspDocumentId,
        status: "submitted",
        submittedPayloadSha256: doc.payloadSha256,
        submittedByUserId: user.id ?? null,
        notes,
      })
      .returning();

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "ssp.submit_to_doc_control",
      resourceType: "ssp_document",
      resourceId: sspDocumentId,
      details: {
        submission_id: submission.id,
        ssp_version: doc.versionNumber,
        payload_sha256: doc.payloadSha256,
        signoff_count: signoffs.length,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        submission,
        sspDocumentId,
        sspVersion: doc.versionNumber,
        payloadSha256: doc.payloadSha256,
        status: submission.status,
      },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/ssp/:id/submit-to-doc-control]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Submission failed",
      },
      { status: 500 },
    );
  }
}
