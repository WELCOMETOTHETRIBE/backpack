/**
 * End-to-end smoke for Phase C2: sign the latest draft SSP, then
 * compute the drift report against current evidence.
 *
 * npx tsx src/scripts/smoke-ssp-sign-verify.ts
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, sspDocuments } from "@/db/schema";
import { computeDriftReport } from "@/lib/ssp/drift";
import { signSsp } from "@/lib/ssp/sign";

(async () => {
  const slug = process.argv[2] ?? "mactech-solutions-llc";
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`Org not found: ${slug}`);

  const [draft] = await db
    .select()
    .from(sspDocuments)
    .where(and(eq(sspDocuments.organizationId, org.id), eq(sspDocuments.status, "draft")))
    .orderBy(desc(sspDocuments.versionNumber))
    .limit(1);
  if (!draft) throw new Error("No draft SSP to sign");

  const sig = signSsp(draft.payloadSha256);
  console.log("signature produced:", JSON.stringify(sig));

  await db
    .update(sspDocuments)
    .set({
      status: "signed",
      signatureAlg: sig.alg,
      signatureKid: sig.kid,
      signatureValue: sig.value,
      signedAt: sig.signedAt,
    })
    .where(eq(sspDocuments.id, draft.id));

  const report = await computeDriftReport(draft.id);
  console.log(
    "drift report:",
    JSON.stringify(
      {
        topLevel: report?.topLevel,
        signatureValid: report?.signatureValid,
        signatureReason: report?.signatureReason,
        sectionsByOutcome: {
          identical: report?.sections.filter((s) => s.outcome === "identical").length,
          drift: report?.sections.filter((s) => s.outcome === "drift").length,
          missing: report?.sections.filter((s) => s.outcome === "missing").length,
        },
        sectionCount: report?.sections.length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
