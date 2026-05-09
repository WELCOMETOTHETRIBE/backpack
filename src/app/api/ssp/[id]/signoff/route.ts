/**
 * POST /api/ssp/[id]/signoff
 *
 * Captures a human sign-off on a signed SSP. Per Posture A+ from the
 * plan: Codex signs the content (binding evidence to document
 * version); the AO / system_owner / ISSO sign-off here is the human
 * accountability record bound to the same payload_sha256.
 *
 * Body (Zod-strict):
 *   {
 *     signoffKind: "authorizing_official" | "system_owner" | "isso",
 *     signerDisplayName: string (≥2 chars),
 *     signerTitle: string (≥2 chars),
 *     comment?: string
 *   }
 *
 * The signer's display name is bound to the SSP's data_hash. When
 * Posture C lands (customer-held key upload), this endpoint also
 * accepts an optional `signature` envelope (alg + value) that
 * cryptographically binds the signer.
 *
 * Auth: Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { sspDocuments, sspSignoffs } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";

const SignoffSchema = z
  .object({
    signoffKind: z.enum(["authorizing_official", "system_owner", "isso"]),
    signerDisplayName: z.string().min(2).max(255),
    signerTitle: z.string().min(2).max(255),
    comment: z.string().max(2000).optional(),
    /**
     * Posture C extension — customer-supplied detached signature over
     * the SSP's payload_sha256. Optional today; required once Posture
     * C is wired.
     */
    signature: z
      .object({
        alg: z.enum(["ed25519", "rs256"]),
        value: z.string().min(1),
      })
      .optional(),
  })
  .strict();

export async function POST(
  req: NextRequest,
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

  const raw = await req.json().catch(() => null);
  const parsed = SignoffSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [doc] = await db
    .select()
    .from(sspDocuments)
    .where(eq(sspDocuments.id, id))
    .limit(1);
  if (!doc || doc.organizationId !== orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (doc.status !== "signed") {
    return NextResponse.json(
      {
        error: `Cannot record sign-off — SSP status is ${doc.status}. Sign-offs only land on a signed SSP version.`,
      },
      { status: 409 },
    );
  }

  const [signoff] = await db
    .insert(sspSignoffs)
    .values({
      organizationId: orgId,
      sspDocumentId: doc.id,
      signoffKind: parsed.data.signoffKind,
      signerUserId: user.id,
      signerDisplayName: parsed.data.signerDisplayName,
      signerTitle: parsed.data.signerTitle,
      dataHash: doc.payloadSha256,
      signatureAlg: parsed.data.signature?.alg ?? "attestation_only",
      signatureValue: parsed.data.signature?.value ?? null,
      comment: parsed.data.comment ?? null,
    })
    .returning();

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "ssp.signoff_recorded",
    resourceType: "ssp_signoff",
    resourceId: signoff.id,
    details: {
      sspDocumentId: doc.id,
      versionNumber: doc.versionNumber,
      payloadSha256: doc.payloadSha256,
      signoffKind: signoff.signoffKind,
      signerDisplayName: signoff.signerDisplayName,
      signerTitle: signoff.signerTitle,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      signoff: {
        id: signoff.id,
        sspDocumentId: signoff.sspDocumentId,
        signoffKind: signoff.signoffKind,
        signerDisplayName: signoff.signerDisplayName,
        signerTitle: signoff.signerTitle,
        dataHash: signoff.dataHash,
        signedAt: signoff.signedAt,
      },
    },
    { status: 201 },
  );
}
