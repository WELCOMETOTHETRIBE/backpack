import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceArtifactCompletions,
  controlRecords,
  attestations,
  users,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAttestationTemplate } from "@/lib/compliance/attestation-templates";

/**
 * GET /api/adjudication/attest/receipt/[completionId]
 *
 * Returns the immutable receipt for a signed attestation -- the verbatim
 * legal text the customer accepted, who signed it, when, and the SHA-256
 * dataHash that binds the signature to that exact text. The artifacts page
 * opens this in a modal so a C3PAO (or the customer themselves) can inspect
 * the declaration without leaving the artifacts library.
 *
 * The completion id is the governance_artifact_completion row id (the same
 * id the artifacts table renders with an "att:" prefix). The matching
 * `attestations` row -- which holds the dataHash -- is found by joining on
 * resourceId = controlRecordId, since the attest flow writes one attestation
 * per signed completion.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ completionId: string }> },
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { completionId } = await params;

  const [row] = await db
    .select({
      completion: governanceArtifactCompletions,
      controlId: controlRecords.controlId,
      signatoryName: users.name,
      signatoryEmail: users.email,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(
      controlRecords,
      eq(controlRecords.id, governanceArtifactCompletions.controlRecordId),
    )
    .leftJoin(users, eq(users.id, governanceArtifactCompletions.attestedBy))
    .where(
      and(
        eq(governanceArtifactCompletions.organizationId, orgId),
        eq(governanceArtifactCompletions.id, completionId),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Attestation not found" }, { status: 404 });
  }

  // Find the matching attestations row -- the dataHash is the canonical
  // proof that the signature is bound to the exact attestation text.
  // attest/route.ts writes one attestations row per signed completion.
  const [attRow] = await db
    .select({
      dataHash: attestations.dataHash,
      attestedAt: attestations.attestedAt,
      comment: attestations.comment,
      signatureCrypto: attestations.signatureCrypto,
    })
    .from(attestations)
    .where(
      and(
        eq(attestations.organizationId, orgId),
        eq(attestations.resourceId, row.completion.controlRecordId),
        eq(attestations.signatoryId, row.completion.attestedBy ?? ""),
      ),
    )
    .orderBy(desc(attestations.attestedAt))
    .limit(1);

  // Pull the canonical template text. The completion.valueText is also a
  // copy, but the live template carries the version-controlled wording the
  // wizard renders today; we surface both so any drift is visible.
  const template = getAttestationTemplate(row.completion.artifactLabel);

  return NextResponse.json({
    completionId: row.completion.id,
    controlId: row.controlId,
    templateId: row.completion.artifactLabel,
    templateName: template?.title ?? row.completion.artifactLabel,
    attestationStatement:
      row.completion.valueText ?? template?.attestationStatement ?? "",
    conditions: template?.conditions ?? [],
    fallbackIfConditionFails: template?.fallbackIfConditionFails ?? null,
    signatory: {
      name: row.signatoryName ?? null,
      email: row.signatoryEmail ?? null,
      // attest/route.ts writes a free-text comment that includes the
      // declared signatory name/title/template -- surface it verbatim so
      // the receipt is self-contained.
      comment: attRow?.comment ?? null,
    },
    attestedAt:
      (row.completion.attestedAt ?? attRow?.attestedAt ?? row.completion.createdAt).toISOString(),
    dataHash: attRow?.dataHash ?? null,
    signatureCrypto: attRow?.signatureCrypto ?? null,
  });
}
