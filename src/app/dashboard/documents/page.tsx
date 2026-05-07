import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  qmsGovernanceManifests,
  qmsGovernanceManifestDocuments,
  controlObservedImplementations,
  organizations,
} from "@/db/schema";
import { and, eq, desc, isNotNull } from "drizzle-orm";
import QmsBundleDocumentsClient, {
  type QmsRun,
  type QmsDoc,
  type OisImpact,
} from "./QmsBundleDocumentsClient";

/**
 * Documents page — surfaces the live QMS Governance Bundle as ingested
 * via /api/integrations/qms-manifest/ingest.
 *
 * Sources of truth:
 *   - qms_governance_manifests           (one row per ingest run)
 *   - qms_governance_manifest_documents  (per-doc rows with sigs + controls)
 *   - control_observed_implementations   (OIS narratives the run refreshed)
 *
 * The previously-shipped page read from `governance_documents` /
 * `governance_manifest_runs` / `governance_document_control_links` —
 * those are codex-native bundle docs from a different ingest path and
 * never see the QMS-pushed manifests. This rewrite addresses the
 * "QMS release isn't surfaced in codex" gap.
 */

export default async function DocumentsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // 1. Pick the latest QMS manifest run for this org. If none, the
  // page renders an "awaiting first ingest" empty state.
  const [latestRun] = await db
    .select({
      runId: qmsGovernanceManifests.runId,
      schemaVersion: qmsGovernanceManifests.schemaVersion,
      generatedAt: qmsGovernanceManifests.generatedAt,
      receivedAt: qmsGovernanceManifests.receivedAt,
      generatedBy: qmsGovernanceManifests.generatedBy,
      toolVersion: qmsGovernanceManifests.toolVersion,
      source: qmsGovernanceManifests.source,
      docCount: qmsGovernanceManifests.docCount,
      controlsTouched: qmsGovernanceManifests.controlsTouched,
      contentHash: qmsGovernanceManifests.contentHash,
      signingHash: qmsGovernanceManifests.signingHash,
      signatureKid: qmsGovernanceManifests.signatureKid,
      issuerService: qmsGovernanceManifests.issuerService,
      issuerUrl: qmsGovernanceManifests.issuerUrl,
    })
    .from(qmsGovernanceManifests)
    .where(eq(qmsGovernanceManifests.organizationId, orgId))
    .orderBy(desc(qmsGovernanceManifests.receivedAt))
    .limit(1);

  // 2. Run history (last 10) so an auditor can see the cadence.
  const runHistory = await db
    .select({
      runId: qmsGovernanceManifests.runId,
      schemaVersion: qmsGovernanceManifests.schemaVersion,
      receivedAt: qmsGovernanceManifests.receivedAt,
      generatedAt: qmsGovernanceManifests.generatedAt,
      docCount: qmsGovernanceManifests.docCount,
      generatedBy: qmsGovernanceManifests.generatedBy,
      contentHash: qmsGovernanceManifests.contentHash,
    })
    .from(qmsGovernanceManifests)
    .where(eq(qmsGovernanceManifests.organizationId, orgId))
    .orderBy(desc(qmsGovernanceManifests.receivedAt))
    .limit(10);

  // 3. Per-doc rows for the latest run — the meat of the page.
  const docs = latestRun
    ? await db
        .select({
          documentNumber: qmsGovernanceManifestDocuments.documentNumber,
          documentName: qmsGovernanceManifestDocuments.documentName,
          documentType: qmsGovernanceManifestDocuments.documentType,
          version: qmsGovernanceManifestDocuments.version,
          status: qmsGovernanceManifestDocuments.status,
          effectiveDate: qmsGovernanceManifestDocuments.effectiveDate,
          nextReviewDate: qmsGovernanceManifestDocuments.nextReviewDate,
          sha256: qmsGovernanceManifestDocuments.sha256,
          released: qmsGovernanceManifestDocuments.released,
          releasedAt: qmsGovernanceManifestDocuments.releasedAt,
          controlsMapped: qmsGovernanceManifestDocuments.controlsMapped,
          signatures: qmsGovernanceManifestDocuments.signatures,
        })
        .from(qmsGovernanceManifestDocuments)
        .where(
          and(
            eq(qmsGovernanceManifestDocuments.organizationId, orgId),
            eq(qmsGovernanceManifestDocuments.runId, latestRun.runId),
          ),
        )
        .orderBy(qmsGovernanceManifestDocuments.documentNumber)
    : [];

  // 4. OIS narratives that reference THIS run's manifest — the
  // proof-of-impact for a C3PAO ("here are the controls whose
  // mechanism evidence was refreshed by this release").
  const oisImpact = latestRun
    ? await db
        .select({
          controlId: controlObservedImplementations.controlId,
          generatedAt: controlObservedImplementations.generatedAt,
          mostRecentEvidenceAt: controlObservedImplementations.mostRecentEvidenceAt,
        })
        .from(controlObservedImplementations)
        .where(
          and(
            eq(controlObservedImplementations.organizationId, orgId),
            eq(controlObservedImplementations.generatedFromManifestId, latestRun.runId),
          ),
        )
        .orderBy(controlObservedImplementations.controlId)
    : [];

  // Cumulative coverage: how many *unique* controls have at least one
  // released-effective doc in their controls_mapped, across the latest
  // run? This is the headline number — "QMS is backing N controls
  // right now." Pure CMMC-L2 governance evidence count.
  const controlsWithBacking = new Set<string>();
  for (const d of docs) {
    if (!d.released || d.status !== "effective") continue;
    const mapped = (d.controlsMapped as string[] | null) ?? [];
    for (const c of mapped) {
      if (typeof c === "string" && c) controlsWithBacking.add(c);
    }
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return (
    <QmsBundleDocumentsClient
      orgName={org?.name ?? "Your org"}
      latestRun={
        latestRun
          ? ({
              runId: latestRun.runId,
              schemaVersion: latestRun.schemaVersion,
              generatedAt: toIso(latestRun.generatedAt),
              receivedAt: toIso(latestRun.receivedAt),
              generatedBy: latestRun.generatedBy,
              toolVersion: latestRun.toolVersion,
              source: latestRun.source,
              docCount: latestRun.docCount,
              controlsTouched:
                (latestRun.controlsTouched as string[] | null) ?? [],
              contentHash: latestRun.contentHash,
              signingHash: latestRun.signingHash,
              signatureKid: latestRun.signatureKid,
              issuerService: latestRun.issuerService,
              issuerUrl: latestRun.issuerUrl,
            } satisfies QmsRun)
          : null
      }
      runHistory={runHistory.map(
        (r) =>
          ({
            runId: r.runId,
            schemaVersion: r.schemaVersion,
            receivedAt: toIso(r.receivedAt),
            generatedAt: toIso(r.generatedAt),
            generatedBy: r.generatedBy,
            docCount: r.docCount,
            contentHash: r.contentHash,
          }) satisfies QmsRun,
      )}
      docs={docs.map(
        (d) =>
          ({
            documentNumber: d.documentNumber,
            documentName: d.documentName,
            documentType: d.documentType,
            version: d.version,
            status: d.status,
            effectiveDate: toIsoOrNull(d.effectiveDate),
            nextReviewDate: toIsoOrNull(d.nextReviewDate),
            sha256: d.sha256,
            released: d.released,
            releasedAt: d.releasedAt,
            controlsMapped: ((d.controlsMapped as string[] | null) ?? []).filter(
              (x) => typeof x === "string" && x,
            ),
            signatures:
              ((d.signatures as Record<string, unknown>[] | null) ?? []).map((s) => ({
                signerName: (s.signer_name as string | null) ?? null,
                signerEmail: (s.signer_email as string | null) ?? null,
                signatureMeaning:
                  (s.signature_meaning as string | null) ?? null,
                signedAt: (s.signed_at as string | null) ?? null,
                signatureHash:
                  (s.signature_hash as string | null) ?? null,
              })),
          }) satisfies QmsDoc,
      )}
      oisImpact={oisImpact.map(
        (o) =>
          ({
            controlId: o.controlId,
            generatedAt: toIso(o.generatedAt),
            mostRecentEvidenceAt: toIsoOrNull(o.mostRecentEvidenceAt),
          }) satisfies OisImpact,
      )}
      controlsWithBackingCount={controlsWithBacking.size}
    />
  );
}

function toIso(v: Date | string | null | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
