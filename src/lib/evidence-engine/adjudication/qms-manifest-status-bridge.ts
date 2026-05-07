/**
 * Bridge from a freshly-ingested QMS manifest to the codex tables that
 * actually drive control-status flipping.
 *
 * Why: the QMS-ingest endpoint persists per-doc rows into
 * qms_governance_manifest_documents and refreshes the OIS narrative,
 * but `calculateControlStatus.hasApprovedGovDocs` reads
 * `governance_documents` (the codex-native table). Without this bridge
 * the QMS-pushed docs are invisible to the adjudication scorer and
 * controls never flip from Not Started → In Progress → Implemented.
 *
 * What this does, per QMS-ingest run:
 *   1. UPSERT one governance_documents row per QMS doc (status = APPROVED
 *      because released:true means the QMS quality gate is satisfied —
 *      Reviewer + Approver + Quality Release sigs all on file).
 *   2. UPSERT governance_document_control_links — one row per
 *      (doc, control_id) pair from controls_mapped.
 *   3. Call calculateControlStatus(controlRecord.id) for every
 *      control_record in the org whose controlId is in
 *      controls_touched. This persists the new
 *      implementation_status to control_records, which the dashboard
 *      reads.
 *
 * Failure-tolerant — every step logs and moves on. The ingest endpoint
 * should never fail because of this bridge; that's a fix-forward issue,
 * not a refuse-the-manifest issue.
 *
 * Doc-type mapping (QMS lower-case → codex governance_doc_type enum):
 *   policy          → POLICY
 *   procedure       → PROCEDURE
 *   plan            → PLAN
 *   ssp             → PLAN          (no SSP enum value; PLAN is closest)
 *   security_guide  → STANDARD
 *   assessment      → TEMPLATE      (poor fit but the closest option)
 */

import { db } from "@/db";
import {
  governanceDocuments,
  governanceDocumentControlLinks,
  governanceManifestRuns,
  controlRecords,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { calculateControlStatus } from "@/lib/control-status";
import type { ManifestEnvelope } from "@/lib/integrations/qms-manifest-schema";

const QMS_TYPE_MAP: Record<string, "POLICY" | "PROCEDURE" | "PLAN" | "STANDARD" | "CHARTER" | "TEMPLATE" | "SOP"> = {
  policy: "POLICY",
  procedure: "PROCEDURE",
  plan: "PLAN",
  ssp: "PLAN",
  security_guide: "STANDARD",
  assessment: "TEMPLATE",
};

interface BridgeContext {
  orgId: string;
  envelope: ManifestEnvelope;
}

interface BridgeResult {
  documentsUpserted: number;
  linksUpserted: number;
  controlRecordsRecalculated: number;
  errors: string[];
}

export async function bridgeQmsManifestToGovernance(
  ctx: BridgeContext,
): Promise<BridgeResult> {
  const out: BridgeResult = {
    documentsUpserted: 0,
    linksUpserted: 0,
    controlRecordsRecalculated: 0,
    errors: [],
  };
  const { orgId, envelope } = ctx;

  // Map approval date: prefer doc.released_at, fall back to effective_date,
  // fall back to envelope.generated_at. governance_documents.approvalDate is
  // a `date` (ISO yyyy-mm-dd) so we drop the time portion.
  function approvalDateOf(d: ManifestEnvelope["documents"][number]): string | null {
    const candidate = d.released_at ?? d.effective_date ?? envelope.generated_at;
    if (!candidate) return null;
    const dt = new Date(candidate);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  // ── 1. UPSERT each doc into governance_documents ───────────────────────
  for (const d of envelope.documents) {
    if (!d.released) continue; // unreleased docs aren't "APPROVED" evidence
    const typeKey = (d.document_type ?? "").toLowerCase();
    const typeEnum = QMS_TYPE_MAP[typeKey] ?? "POLICY"; // safest default
    const approvalDate = approvalDateOf(d);

    try {
      // Drizzle pgTable + onConflictDoUpdate. governance_documents has no
      // unique key on (orgId, docId), so we use a manual lookup-then-upsert.
      const [existing] = await db
        .select({ id: governanceDocuments.id })
        .from(governanceDocuments)
        .where(
          and(
            eq(governanceDocuments.organizationId, orgId),
            eq(governanceDocuments.docId, d.document_number),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(governanceDocuments)
          .set({
            title: d.document_name,
            type: typeEnum,
            version: d.version ?? null,
            status: "APPROVED",
            approvalDate,
            nextReviewDate: d.next_review_date
              ? new Date(d.next_review_date).toISOString().slice(0, 10)
              : null,
            updatedAt: new Date(),
          })
          .where(eq(governanceDocuments.id, existing.id));
      } else {
        await db.insert(governanceDocuments).values({
          organizationId: orgId,
          docId: d.document_number,
          title: d.document_name,
          type: typeEnum,
          version: d.version ?? null,
          status: "APPROVED",
          approvalDate,
          nextReviewDate: d.next_review_date
            ? new Date(d.next_review_date).toISOString().slice(0, 10)
            : null,
        });
      }
      out.documentsUpserted++;
    } catch (err) {
      out.errors.push(
        `governance_documents upsert failed for ${d.document_number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── 2. Replace governance_document_control_links for THIS run's docs ──
  // The schema requires manifest_run_id to be a UUID FK to
  // governance_manifest_runs.id (codex-native). The QMS run_id is a
  // text key on a different table (qms_governance_manifests) — to
  // satisfy the FK we mirror the QMS run into governance_manifest_runs
  // first (UPSERT on (org, run_id)) and use its UUID.
  const docNumbersInRun = envelope.documents
    .filter((d) => d.released)
    .map((d) => d.document_number);

  if (docNumbersInRun.length > 0) {
    try {
      // Mirror this run into governance_manifest_runs. Idempotent on the
      // (org, run_id) unique index. Returns the UUID we'll FK against.
      let runUuid: string;
      const [existingRun] = await db
        .select({ id: governanceManifestRuns.id })
        .from(governanceManifestRuns)
        .where(
          and(
            eq(governanceManifestRuns.organizationId, orgId),
            eq(governanceManifestRuns.runId, envelope.run_id),
          ),
        )
        .limit(1);
      if (existingRun) {
        runUuid = existingRun.id;
      } else {
        const [inserted] = await db
          .insert(governanceManifestRuns)
          .values({
            organizationId: orgId,
            runId: envelope.run_id,
            // schemaVersion is integer; the QMS schema is a text like
            // "mactech-governance-manifest.v1.2". We default the integer
            // column to 3 (ISSO weekly export schema) since the codex-
            // native column predates the QMS path; a non-fatal
            // mismatch — auditors should look at qms_governance_manifests
            // for the QMS-side schema string.
            schemaVersion: 3,
            bundleSource: envelope.source ?? "qms_document_control",
            docCount: envelope.doc_count,
          })
          .returning({ id: governanceManifestRuns.id });
        runUuid = inserted.id;
      }

      // Drop existing links for these docs in this org.
      await db
        .delete(governanceDocumentControlLinks)
        .where(
          and(
            eq(governanceDocumentControlLinks.organizationId, orgId),
            inArray(governanceDocumentControlLinks.docCode, docNumbersInRun),
          ),
        );

      const linkRows: {
        organizationId: string;
        manifestRunId: string;
        docCode: string;
        controlId: string;
        satisfactionType: string;
      }[] = [];
      for (const d of envelope.documents) {
        if (!d.released) continue;
        for (const cid of d.controls_mapped ?? []) {
          if (typeof cid !== "string" || !cid) continue;
          linkRows.push({
            organizationId: orgId,
            manifestRunId: runUuid,
            docCode: d.document_number,
            controlId: cid,
            satisfactionType: "primary",
          });
        }
      }
      if (linkRows.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < linkRows.length; i += CHUNK) {
          await db
            .insert(governanceDocumentControlLinks)
            .values(linkRows.slice(i, i + CHUNK));
        }
      }
      out.linksUpserted = linkRows.length;
    } catch (err) {
      out.errors.push(
        `governance_document_control_links replace failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── 3. Re-run calculateControlStatus for every control_record whose
  //       controlId is in controls_touched. This pushes the new
  //       implementation_status into control_records so the dashboard
  //       reflects the QMS evidence on next page load.
  if ((envelope.controls_touched?.length ?? 0) > 0) {
    try {
      const recs = await db
        .select({ id: controlRecords.id, controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            inArray(controlRecords.controlId, envelope.controls_touched),
          ),
        );
      for (const r of recs) {
        try {
          await calculateControlStatus(r.id);
          out.controlRecordsRecalculated++;
        } catch (err) {
          out.errors.push(
            `calculateControlStatus failed for ${r.controlId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      out.errors.push(
        `control_records recalc lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return out;
}
