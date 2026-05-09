/**
 * POST /api/ssp/[id]/sign
 *
 * Applies the Codex-side signature to a draft SSP and marks it
 * 'signed'. Supersedes any prior signed version for this org. Posture
 * A+ from the plan: Codex signs the payload_sha256 (cryptographic
 * binding when SSP_SIGNING_HMAC_SECRET is set; attestation-only
 * otherwise); customer countersignature lands as a separate row
 * via /signoff.
 *
 * Auth: Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { sspDocuments } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { signSsp } from "@/lib/ssp/sign";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const [doc] = await db
    .select()
    .from(sspDocuments)
    .where(and(eq(sspDocuments.id, id), eq(sspDocuments.organizationId, orgId)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.status === "signed") {
    return NextResponse.json(
      { error: "Already signed", payloadSha256: doc.payloadSha256 },
      { status: 409 },
    );
  }
  if (doc.status === "superseded" || doc.status === "revoked") {
    return NextResponse.json(
      {
        error: `Cannot sign — status is ${doc.status}. Generate a new version.`,
      },
      { status: 409 },
    );
  }

  const sig = signSsp(doc.payloadSha256);

  const [updated] = await db
    .update(sspDocuments)
    .set({
      status: "signed",
      signatureAlg: sig.alg,
      signatureKid: sig.kid,
      signatureValue: sig.value,
      signedAt: sig.signedAt,
      signedByUserId: user.id,
    })
    .where(eq(sspDocuments.id, doc.id))
    .returning();

  // Mark prior signed version as superseded.
  await db
    .update(sspDocuments)
    .set({
      status: "superseded",
      supersededAt: new Date(),
      supersededById: updated.id,
    })
    .where(
      and(
        eq(sspDocuments.organizationId, orgId),
        eq(sspDocuments.status, "signed"),
        sql`${sspDocuments.id} <> ${updated.id}`,
      ),
    );

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "ssp.signed",
    resourceType: "ssp_document",
    resourceId: updated.id,
    details: {
      versionNumber: updated.versionNumber,
      payloadSha256: updated.payloadSha256,
      signatureAlg: sig.alg,
      controlsMet: updated.controlsMet,
      controlsNotMet: updated.controlsNotMet,
      controlsNa: updated.controlsNa,
    },
  });

  return NextResponse.json({
    ok: true,
    sspDocumentId: updated.id,
    versionNumber: updated.versionNumber,
    status: updated.status,
    payloadSha256: updated.payloadSha256,
    signature: {
      alg: sig.alg,
      kid: sig.kid,
      value: sig.value,
      signedAt: sig.signedAt,
    },
  });
}
