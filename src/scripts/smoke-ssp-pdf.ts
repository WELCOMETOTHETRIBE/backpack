/**
 * Smoke: render the latest signed SSP to PDF and write to /tmp.
 *
 * npx tsx src/scripts/smoke-ssp-pdf.ts
 */
import { promises as fs } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, sspDocuments, sspSignoffs } from "@/db/schema";
import {
  SspDocument,
  type SspPdfMeta,
  type SspPdfPayload,
} from "@/lib/ssp/pdf/SspDocument";

(async () => {
  const slug = process.argv[2] ?? "mactech-solutions-llc";
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`Org not found: ${slug}`);

  const [doc] = await db
    .select()
    .from(sspDocuments)
    .where(
      and(
        eq(sspDocuments.organizationId, org.id),
        eq(sspDocuments.status, "signed"),
      ),
    )
    .orderBy(desc(sspDocuments.versionNumber))
    .limit(1);
  if (!doc) throw new Error("No signed SSP for this org");

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

  console.log(
    `Rendering SSP v${doc.versionNumber} (${doc.payloadSha256.slice(0, 12)}…)…`,
  );
  const t0 = Date.now();
  const buffer = await renderToBuffer(
    SspDocument({
      payload: doc.payloadJson as unknown as SspPdfPayload,
      meta,
    }) as unknown as Parameters<typeof renderToBuffer>[0],
  );
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const outPath = `/tmp/ssp-v${doc.versionNumber}-${doc.payloadSha256.slice(0, 12)}.pdf`;
  await fs.writeFile(outPath, buffer);
  console.log(
    `done in ${elapsed}s — ${buffer.length} bytes → ${outPath}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
