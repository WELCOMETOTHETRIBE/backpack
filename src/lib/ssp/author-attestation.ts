/**
 * Author attestation for SSP versions.
 *
 * On Generate, Codex records ONE attestation identifying the user who
 * authored + transmitted this version. This is NOT an approval
 * signature — it's submission provenance, analogous to a doc system's
 * "submitted_by" field. QMS's Reviewer / Approver / Quality Release
 * chain stays entirely separate and is what makes the SSP defensibly
 * released.
 *
 * Why one attestation instead of three role attestations:
 *   - Three role attestations (ISSO + System Owner + Authorizing
 *     Official) all attributed to the same user is misleading — a
 *     single human cannot truthfully sign as three roles. That was
 *     the bad pattern we removed.
 *   - One author attestation is honest: "Patrick Caruso clicked
 *     Generate at 2026-05-09 22:00 UTC bound to payload_sha256 X."
 *     Doesn't claim any approval role. Doesn't conflict with the
 *     QMS-side review chain.
 *
 * The row lives in sspSignoffs with kind='author' and
 * signature_alg='codex_author_attestation'. Bridge transmission
 * surfaces it as the top-level `author` field, NOT inside the
 * signoffs[] array (which is reserved for ISSO/SO/AO approvals when
 * those happen — they're optional and orthogonal to authorship).
 */
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { sspSignoffs, users } from "@/db/schema";

export const AUTHOR_SIGNOFF_KIND = "author";
export const AUTHOR_SIGNATURE_ALG = "codex_author_attestation";

export interface AuthorAttestationInput {
  organizationId: string;
  sspDocumentId: string;
  payloadSha256: string;
  authorUserId: string;
}

export interface AuthorAttestationResult {
  /** True if a fresh row was inserted; false if one already existed. */
  created: boolean;
  author: {
    userId: string;
    displayName: string;
    email: string;
    attestedAt: Date;
  };
}

/**
 * Persist (or read back, if already present) a single author
 * attestation for the SSP version. Idempotent on
 * (sspDocumentId, kind='author').
 */
export async function recordAuthorAttestation(
  input: AuthorAttestationInput,
): Promise<AuthorAttestationResult> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, input.authorUserId))
    .limit(1);
  if (!user) {
    throw new Error(`User ${input.authorUserId} not found`);
  }
  const displayName = user.name?.trim() || user.email;

  const existing = await db
    .select({
      id: sspSignoffs.id,
      signedAt: sspSignoffs.signedAt,
    })
    .from(sspSignoffs)
    .where(
      and(
        eq(sspSignoffs.sspDocumentId, input.sspDocumentId),
        eq(sspSignoffs.signoffKind, AUTHOR_SIGNOFF_KIND),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      created: false,
      author: {
        userId: user.id,
        displayName,
        email: user.email,
        attestedAt: existing[0].signedAt,
      },
    };
  }

  const attestedAt = new Date();
  await db.insert(sspSignoffs).values({
    organizationId: input.organizationId,
    sspDocumentId: input.sspDocumentId,
    signoffKind: AUTHOR_SIGNOFF_KIND,
    signerUserId: input.authorUserId,
    signerDisplayName: displayName,
    signerTitle: "SSP Author",
    dataHash: input.payloadSha256,
    signatureAlg: AUTHOR_SIGNATURE_ALG,
    // Self-describing value so a C3PAO scanning the signoff chain knows
    // this is generate-time authorship metadata, NOT an approval
    // signature. Approvals (Reviewer/Approver/QR) live on the QMS side.
    signatureValue: `${AUTHOR_SIGNATURE_ALG}@${attestedAt.toISOString()}#sha256:${input.payloadSha256.slice(0, 16)}`,
    signedAt: attestedAt,
    comment:
      "Author attestation recorded by Codex on SSP generate. NOT an approval signature — release signature chain (Reviewer / Approver / Quality Release) is QMS-side per v2.13 page-204 separation of concerns.",
  });

  return {
    created: true,
    author: {
      userId: user.id,
      displayName,
      email: user.email,
      attestedAt,
    },
  };
}
