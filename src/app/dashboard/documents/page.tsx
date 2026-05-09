import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  qmsGovernanceManifests,
  qmsGovernanceManifestDocuments,
  controlObservedImplementations,
  controlImplementations,
  controls,
  organizations,
} from "@/db/schema";
import { and, eq, desc, isNotNull, sql } from "drizzle-orm";
import QmsBundleDocumentsClient, {
  type QmsRun,
  type QmsDoc,
  type LibraryDoc,
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

  // 4. Library view — most-recent version of each unique document_number
  // for this org, across ALL runs. Persistent regardless of which
  // release the doc currently appears in. Released versions outrank
  // unreleased; among same release-state, the most recent released_at
  // wins, then most recent effective_date, then updated_at.
  //
  // The accompanying versionCount tells the client how many distinct
  // versions exist so it can offer a per-doc history affordance.
  // Recency signal: join to qms_governance_manifests.received_at (the
  // run that introduced the row). The doc table has released_at (text)
  // and effective_date (timestamptz) but no updated_at — received_at
  // is the most reliable "which version is freshest" proxy.
  const libraryRowsRaw = await db.execute(sql`
    SELECT DISTINCT ON (qgmd.document_number)
      qgmd.document_number, qgmd.document_name, qgmd.document_type,
      qgmd.version, qgmd.status,
      qgmd.effective_date, qgmd.next_review_date, qgmd.sha256,
      qgmd.released, qgmd.released_at,
      qgmd.controls_mapped, qgmd.signatures, qgmd.run_id,
      qgm.received_at AS source_received_at
    FROM qms_governance_manifest_documents qgmd
    JOIN qms_governance_manifests qgm ON qgm.run_id = qgmd.run_id
    WHERE qgmd.organization_id = ${orgId}
    ORDER BY
      qgmd.document_number,
      (CASE WHEN qgmd.released THEN 0 ELSE 1 END),
      qgmd.released_at DESC NULLS LAST,
      qgmd.effective_date DESC NULLS LAST,
      qgm.received_at DESC
  `);
  const libraryRows = libraryRowsRaw as unknown as Array<{
    document_number: string;
    document_name: string;
    document_type: string | null;
    version: string | null;
    status: string | null;
    effective_date: Date | string | null;
    next_review_date: Date | string | null;
    sha256: string;
    released: boolean;
    released_at: Date | string | null;
    controls_mapped: unknown;
    signatures: unknown;
    run_id: string;
    source_received_at: Date | string | null;
  }>;

  const versionCountsRaw = await db.execute(sql`
    SELECT document_number, count(*)::int AS n
    FROM qms_governance_manifest_documents
    WHERE organization_id = ${orgId}
    GROUP BY document_number
  `);
  const versionCounts = new Map<string, number>();
  for (const r of versionCountsRaw as unknown as Array<{
    document_number: string;
    n: number;
  }>) {
    versionCounts.set(r.document_number, r.n);
  }

  // 5. OIS narratives that reference THIS run's manifest — the
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

  // /dashboard/controls/[id] expects a control_implementations.id (UUID),
  // but controls referenced from QMS docs and OIS rows arrive as control
  // codes (e.g. "AC.L2-3.1.1" or short "3.1.1"). Build a code → UUID map
  // for this org so the client can render real, working hrefs instead of
  // 404-bound code-strings.
  const implRows = await db
    .select({
      implId: controlImplementations.id,
      controlCode: controls.controlId,
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .where(eq(controlImplementations.organizationId, orgId));

  const controlCodeToImplId: Record<string, string> = {};
  for (const r of implRows) {
    controlCodeToImplId[r.controlCode] = r.implId;
    // Also key by the bare requirement number ("3.1.1") so docs that
    // reference the short form still resolve.
    const bare = r.controlCode.replace(/^[A-Z]{2,3}\.L\d+-/, "");
    if (bare && bare !== r.controlCode) controlCodeToImplId[bare] = r.implId;
  }

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
      libraryDocs={libraryRows.map(
        (d) =>
          ({
            documentNumber: d.document_number,
            documentName: d.document_name,
            documentType: d.document_type,
            version: d.version,
            status: d.status,
            effectiveDate: toIsoOrNull(d.effective_date),
            nextReviewDate: toIsoOrNull(d.next_review_date),
            sha256: d.sha256,
            released: d.released,
            releasedAt: toIsoOrNull(d.released_at),
            controlsMapped: ((d.controls_mapped as string[] | null) ?? []).filter(
              (x) => typeof x === "string" && x,
            ),
            signatures:
              ((d.signatures as Record<string, unknown>[] | null) ?? []).map(
                (s) => ({
                  signerName: (s.signer_name as string | null) ?? null,
                  signerEmail: (s.signer_email as string | null) ?? null,
                  signatureMeaning:
                    (s.signature_meaning as string | null) ?? null,
                  signedAt: (s.signed_at as string | null) ?? null,
                  signatureHash:
                    (s.signature_hash as string | null) ?? null,
                }),
              ),
            // Library-only enrichment: how many distinct versions of
            // this doc exist for this org, and which run sourced the
            // visible row (so the auditor can trace the persistence
            // path back to the manifest that introduced it).
            versionCount: versionCounts.get(d.document_number) ?? 1,
            sourceRunId: d.run_id,
          }) satisfies LibraryDoc,
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
      controlCodeToImplId={controlCodeToImplId}
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
