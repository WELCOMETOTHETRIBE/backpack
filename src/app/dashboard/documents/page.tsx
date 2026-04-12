import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  governanceDocuments,
  governanceDocumentControlLinks,
  governanceManifestRuns,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
} from "@/lib/compliance/control-bins";
import DocumentsClient from "./DocumentsClient";

const ALL_GOV_CONTROL_IDS = [...new Set([...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS])];

export default async function DocumentsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [docs, docLinks, runs] = await Promise.all([
    db
      .select({
        id: governanceDocuments.id,
        docId: governanceDocuments.docId,
        title: governanceDocuments.title,
        type: governanceDocuments.type,
        domain: governanceDocuments.domain,
        version: governanceDocuments.version,
        status: governanceDocuments.status,
        approvalDate: governanceDocuments.approvalDate,
        nextReviewDate: governanceDocuments.nextReviewDate,
      })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId))
      .orderBy(governanceDocuments.docId),

    db
      .select({
        docCode: governanceDocumentControlLinks.docCode,
        controlId: governanceDocumentControlLinks.controlId,
      })
      .from(governanceDocumentControlLinks)
      .where(eq(governanceDocumentControlLinks.organizationId, orgId)),

    db
      .select({
        runId: governanceManifestRuns.runId,
        ingestedAt: governanceManifestRuns.ingestedAt,
        docCount: governanceManifestRuns.docCount,
        bundleSource: governanceManifestRuns.bundleSource,
      })
      .from(governanceManifestRuns)
      .where(eq(governanceManifestRuns.organizationId, orgId))
      .orderBy(desc(governanceManifestRuns.ingestedAt))
      .limit(5),
  ]);

  return (
    <DocumentsClient
      initialDocs={docs.map((d) => ({
        ...d,
        approvalDate: d.approvalDate ?? null,
        nextReviewDate: d.nextReviewDate ?? null,
        domain: d.domain ?? null,
        version: d.version ?? null,
        type: d.type ?? null,
      }))}
      docLinks={docLinks}
      runs={runs.map((r) => ({
        ...r,
        ingestedAt: r.ingestedAt instanceof Date ? r.ingestedAt.toISOString() : String(r.ingestedAt),
        bundleSource: r.bundleSource ?? null,
      }))}
      allGovControlIds={ALL_GOV_CONTROL_IDS}
    />
  );
}
