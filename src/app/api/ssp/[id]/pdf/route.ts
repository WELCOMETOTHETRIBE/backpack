/**
 * GET /api/ssp/[id]/pdf
 *
 * Renders the canonical SSP JSON to a PDF via @react-pdf/renderer.
 * Stream-on-demand in pilot mode (the bytes aren't persisted to vault
 * blob storage). The PDF is a presentation projection — the canonical
 * JSON remains the source of truth for hashing and signing.
 *
 * Auth: Admin / Compliance / Assessor.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";

import { db } from "@/db";
import { sspDocuments, sspSignoffs } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  SspDocument,
  type SspPdfMeta,
  type SspPdfPayload,
} from "@/lib/ssp/pdf/SspDocument";

export async function GET(
  _req: NextRequest,
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

  const signoffs = await db
    .select({
      signoffKind: sspSignoffs.signoffKind,
      signerDisplayName: sspSignoffs.signerDisplayName,
      signerTitle: sspSignoffs.signerTitle,
      signedAt: sspSignoffs.signedAt,
    })
    .from(sspSignoffs)
    .where(eq(sspSignoffs.sspDocumentId, doc.id));

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
    signoffs: signoffs.map((s) => ({
      signoffKind: s.signoffKind,
      signerDisplayName: s.signerDisplayName,
      signerTitle: s.signerTitle,
      signedAt: s.signedAt,
    })),
  };

  let buffer: Buffer;
  try {
    // SspDocument's element type technically isn't ReactElement<DocumentProps>
    // because React's component-element type-erasure doesn't surface the
    // @react-pdf-internal generic. The runtime works correctly; the cast
    // through unknown narrows past TS's strict element-shape check.
    buffer = await renderToBuffer(
      SspDocument({
        payload: doc.payloadJson as unknown as SspPdfPayload,
        meta,
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "PDF render failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Wrap in Uint8Array view so the BodyInit type is satisfied across
  // Node's Buffer / Web ReadableStream split.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ssp-v${doc.versionNumber}-${doc.payloadSha256.slice(0, 12)}.pdf"`,
      "Content-Length": String(buffer.length),
      "X-SSP-Payload-Sha256": doc.payloadSha256,
      "X-SSP-Version": String(doc.versionNumber),
    },
  });
}
