/**
 * GET /api/ssp/[id]
 *
 * Returns the canonical JSON payload + metadata for a generated SSP
 * version. Use ?format=md for the Markdown serialization, ?format=raw
 * for just the payload_json without the envelope.
 *
 * Auth: Admin / Compliance / Assessor (read).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sspDocuments, sspSectionRevisions } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "md") {
    return new NextResponse(doc.payloadMd, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="ssp-v${doc.versionNumber}-${doc.payloadSha256.slice(0, 12)}.md"`,
        "X-SSP-Payload-Sha256": doc.payloadSha256,
        "X-SSP-Version": String(doc.versionNumber),
      },
    });
  }

  if (format === "raw") {
    return NextResponse.json(doc.payloadJson, {
      headers: {
        "X-SSP-Payload-Sha256": doc.payloadSha256,
        "X-SSP-Version": String(doc.versionNumber),
      },
    });
  }

  // Default — full envelope including section list.
  const sections = await db
    .select()
    .from(sspSectionRevisions)
    .where(eq(sspSectionRevisions.sspDocumentId, doc.id))
    .orderBy(sspSectionRevisions.orderIndex);

  return NextResponse.json({
    id: doc.id,
    organizationId: doc.organizationId,
    boundaryId: doc.boundaryId,
    versionNumber: doc.versionNumber,
    status: doc.status,
    generatedAt: doc.generatedAt,
    generatedFromSnapshotAt: doc.generatedFromSnapshotAt,
    payloadSha256: doc.payloadSha256,
    signature: doc.signatureValue
      ? {
          alg: doc.signatureAlg,
          kid: doc.signatureKid,
          value: doc.signatureValue,
          signedAt: doc.signedAt,
        }
      : null,
    tally: {
      controlsCovered: doc.controlsCovered,
      controlsMet: doc.controlsMet,
      controlsNotMet: doc.controlsNotMet,
      controlsNa: doc.controlsNa,
      controlsMetViaEvidence: doc.controlsMetViaEvidence,
      controlsMetViaEsp: doc.controlsMetViaEsp,
      controlsMetViaEnduringException: doc.controlsMetViaEnduringException,
      controlsMetViaDodCio: doc.controlsMetViaDodCio,
      controlsMetViaOpPlan: doc.controlsMetViaOpPlan,
    },
    sections: sections.map((s) => ({
      id: s.id,
      sectionKind: s.sectionKind,
      sectionKey: s.sectionKey,
      orderIndex: s.orderIndex,
      title: s.title,
      bodyMd: s.bodyMd,
      aggregateFinding: s.aggregateFinding,
      metVia: s.metVia,
    })),
  });
}
