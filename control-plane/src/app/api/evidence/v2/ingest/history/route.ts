import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFindings,
  governanceManifestRuns,
  governanceArtifactCompletions,
  controlRecords,
} from "@/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

const EXPIRY_DAYS = 365;
const STALE_DAYS = 180;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Unified upload event surfaced in the history pane. One row per upload,
 * regardless of pipeline. The `source` discriminator drives icon + label
 * choices in the UI:
 *
 *   cui_evidence_manifest    OS bundle from Collect-Cui-Evidence-v2.ps1
 *   windows_server_hardening OS validator from Test-CuiHardening.ps1
 *   azure_entra              Cloud validator from validate_azure_entra
 *   governance_manifest      Governance bundle (signed policy docs)
 *   attestation              Per-control signed attestation (bucket C/E)
 */
export type IngestHistoryRow = {
  id: string;
  source:
    | "cui_evidence_manifest"
    | "windows_server_hardening"
    | "azure_entra"
    | "governance_manifest"
    | "attestation";
  run_id: string;
  computer_name: string | null;
  /** On-VM filesystem path for the OS bundle ("C:\\evidence\\CUI-Evidence-..."). OS-only. */
  bundle_root: string | null;
  collected_at: string | null;
  ingested_at: string;
  expires_at: string | null;
  freshness: "current" | "stale" | "expired" | "unknown";
  /** Per-check validator findings (windows_server_hardening, azure_entra). */
  pass_count: number;
  partial_count: number;
  fail_count: number;
  /** Files referenced by the OS manifest (cui_evidence_manifest only). */
  files_total: number;
  files_ok: number;
  collection_errors: number;
  /** Documents in a governance bundle (governance_manifest only). */
  doc_count: number;
  /** Number of distinct controls touched by this upload. */
  controls_linked: number;
  /** Attestation only: which artifact label was signed and the control id. */
  attestation_label: string | null;
  attestation_control_id: string | null;
};

function freshnessFor(ageDays: number | null): IngestHistoryRow["freshness"] {
  if (ageDays === null) return "unknown";
  if (ageDays < STALE_DAYS) return "current";
  if (ageDays < EXPIRY_DAYS) return "stale";
  return "expired";
}

/**
 * GET /api/evidence/v2/ingest/history
 *
 * Returns every upload event for the caller's org, newest first. Merges
 * evidence runs (OS manifest + OS validator + cloud validator), governance
 * manifest runs, and signed attestations into a single chronological feed.
 */
export async function GET() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const rows: IngestHistoryRow[] = [];

  // ── Evidence runs (OS manifest + OS validator + cloud validator) ─────────
  const runs = await db
    .select({
      id: evidenceRuns.id,
      runId: evidenceRuns.runId,
      source: evidenceRuns.source,
      collectorName: evidenceRuns.collectorName,
      collectedAt: evidenceRuns.collectedAt,
      createdAt: evidenceRuns.createdAt,
      bundleRoot: evidenceRuns.bundleRoot,
      manifest: evidenceRuns.manifest,
    })
    .from(evidenceRuns)
    .where(eq(evidenceRuns.organizationId, orgId))
    .orderBy(desc(evidenceRuns.createdAt));

  // Per-run finding counts (validator runs only)
  const findingCounts = await db
    .select({
      evidenceRunId: evidenceFindings.evidenceRunId,
      pass: sql<number>`count(*) filter (where ${evidenceFindings.pass} = true and ${evidenceFindings.partial} = false)::int`,
      partial: sql<number>`count(*) filter (where ${evidenceFindings.partial} = true)::int`,
      fail: sql<number>`count(*) filter (where ${evidenceFindings.pass} = false and ${evidenceFindings.partial} = false)::int`,
      controls: sql<number>`count(distinct ${evidenceFindings.controlId})::int`,
    })
    .from(evidenceFindings)
    .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
    .where(eq(evidenceRuns.organizationId, orgId))
    .groupBy(evidenceFindings.evidenceRunId);

  const findingsByRun = new Map(
    findingCounts.map((c) => [
      c.evidenceRunId,
      { pass: c.pass, partial: c.partial, fail: c.fail, controls: c.controls },
    ]),
  );

  for (const r of runs) {
    const collected = r.collectedAt instanceof Date ? r.collectedAt : new Date(r.collectedAt);
    const ingested = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const ageDays = Math.floor((now - collected.getTime()) / MS_PER_DAY);
    const expiresAt = new Date(collected.getTime() + EXPIRY_DAYS * MS_PER_DAY);

    // OS manifest: file counts come from the embedded manifest jsonb,
    // not from evidence_findings (which is validator-side state).
    let filesTotal = 0;
    let filesOk = 0;
    let collectionErrors = 0;
    let computerName: string | null = null;
    if (r.source === "cui_evidence_manifest") {
      const mf = (r.manifest ?? {}) as {
        computer_name?: string;
        files?: Array<{ status?: string }>;
        bundle_validation?: { files_ok?: number; files_total?: number };
      };
      computerName = mf.computer_name ?? null;
      const files = Array.isArray(mf.files) ? mf.files : [];
      filesTotal = files.length;
      collectionErrors = files.filter((f) => f.status === "collection_error").length;
      filesOk = mf.bundle_validation?.files_ok ?? filesTotal - collectionErrors;
    } else if (r.source === "windows_server_hardening") {
      const mf = (r.manifest ?? {}) as { summary?: { computer?: string } };
      computerName = mf.summary?.computer ?? null;
    } else if (r.source === "azure_entra") {
      const mf = (r.manifest ?? {}) as {
        validator?: { name?: string };
        tenant?: { domain?: string };
      };
      computerName = mf.tenant?.domain ?? mf.validator?.name ?? "Azure tenant";
    }

    const fc = findingsByRun.get(r.id);
    const pass = fc?.pass ?? 0;
    const partial = fc?.partial ?? 0;
    const fail = fc?.fail ?? 0;
    const controls = fc?.controls ?? 0;

    rows.push({
      id: `run:${r.id}`,
      source: r.source as IngestHistoryRow["source"],
      run_id: r.runId,
      computer_name: computerName,
      bundle_root: r.bundleRoot || null,
      collected_at: collected.toISOString(),
      ingested_at: ingested.toISOString(),
      expires_at: expiresAt.toISOString(),
      freshness: freshnessFor(ageDays),
      pass_count: pass,
      partial_count: partial,
      fail_count: fail,
      files_total: filesTotal,
      files_ok: filesOk,
      collection_errors: collectionErrors,
      doc_count: 0,
      controls_linked: controls,
      attestation_label: null,
      attestation_control_id: null,
    });
  }

  // ── Governance manifest uploads ──────────────────────────────────────────
  const govRuns = await db
    .select({
      id: governanceManifestRuns.id,
      runId: governanceManifestRuns.runId,
      docCount: governanceManifestRuns.docCount,
      ingestedAt: governanceManifestRuns.ingestedAt,
      bundleSource: governanceManifestRuns.bundleSource,
    })
    .from(governanceManifestRuns)
    .where(eq(governanceManifestRuns.organizationId, orgId))
    .orderBy(desc(governanceManifestRuns.ingestedAt));

  for (const g of govRuns) {
    const ingested = g.ingestedAt instanceof Date ? g.ingestedAt : new Date(g.ingestedAt);
    rows.push({
      id: `gov:${g.id}`,
      source: "governance_manifest",
      run_id: g.runId,
      computer_name: g.bundleSource ?? null,
      bundle_root: null,
      collected_at: ingested.toISOString(),
      ingested_at: ingested.toISOString(),
      expires_at: null,
      freshness: "current",
      pass_count: 0,
      partial_count: 0,
      fail_count: 0,
      files_total: 0,
      files_ok: 0,
      collection_errors: 0,
      doc_count: g.docCount ?? 0,
      controls_linked: 0,
      attestation_label: null,
      attestation_control_id: null,
    });
  }

  // ── Signed attestations (bucket C + E + bundle) ──────────────────────────
  // Each completion row represents a discrete signing event we want to log.
  const atts = await db
    .select({
      id: governanceArtifactCompletions.id,
      label: governanceArtifactCompletions.artifactLabel,
      type: governanceArtifactCompletions.artifactType,
      attestedAt: governanceArtifactCompletions.attestedAt,
      createdAt: governanceArtifactCompletions.createdAt,
      controlId: controlRecords.controlId,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(
      controlRecords,
      eq(controlRecords.id, governanceArtifactCompletions.controlRecordId),
    )
    .where(
      and(
        eq(governanceArtifactCompletions.organizationId, orgId),
        sql`${governanceArtifactCompletions.attestedBy} IS NOT NULL`,
      ),
    )
    .orderBy(desc(governanceArtifactCompletions.attestedAt));

  for (const a of atts) {
    const ts =
      a.attestedAt instanceof Date
        ? a.attestedAt
        : a.attestedAt
          ? new Date(a.attestedAt)
          : a.createdAt instanceof Date
            ? a.createdAt
            : new Date(a.createdAt);
    rows.push({
      id: `att:${a.id}`,
      source: "attestation",
      run_id: `ATT-${a.id.slice(0, 8)}`,
      computer_name: a.controlId,
      bundle_root: null,
      collected_at: ts.toISOString(),
      ingested_at: ts.toISOString(),
      expires_at: null,
      freshness: "current",
      pass_count: 1,
      partial_count: 0,
      fail_count: 0,
      files_total: 0,
      files_ok: 0,
      collection_errors: 0,
      doc_count: 0,
      controls_linked: 1,
      attestation_label: a.label,
      attestation_control_id: a.controlId,
    });
  }

  rows.sort(
    (x, y) => new Date(y.ingested_at).getTime() - new Date(x.ingested_at).getTime(),
  );

  return NextResponse.json(rows);
}
