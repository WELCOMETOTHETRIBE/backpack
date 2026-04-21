import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlEvidenceLinks, controlRecords } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

const EXPIRY_DAYS = 365;
const STALE_DAYS = 180;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type IngestHistoryRow = {
  run_id: string;
  computer_name: string | null;
  collected_at: string | null;
  ingested_at: string;
  expires_at: string | null;
  links_total: number;
  files_ok: number;
  collection_errors: number;
  controls_linked: number;
  freshness: "current" | "stale" | "expired" | "unknown";
};

/**
 * GET /api/evidence/v2/ingest/history
 *
 * Returns prior manifest ingest runs for the caller's org, newest first.
 * Aggregated from control_evidence_links grouped by run_id. Shows per-run
 * link/error counts, host, and freshness so users can audit ingest history
 * (what passed, what failed) from the Upload Evidence Manifest page.
 */
export async function GET() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      runId: controlEvidenceLinks.runId,
      source: controlEvidenceLinks.source,
      description: controlEvidenceLinks.description,
      linkedAt: controlEvidenceLinks.linkedAt,
      expiresAt: controlEvidenceLinks.expiresAt,
      controlRecordId: controlEvidenceLinks.controlRecordId,
    })
    .from(controlEvidenceLinks)
    .innerJoin(controlRecords, eq(controlRecords.id, controlEvidenceLinks.controlRecordId))
    .where(
      and(
        eq(controlEvidenceLinks.organizationId, orgId),
        sql`${controlEvidenceLinks.runId} IS NOT NULL AND ${controlEvidenceLinks.runId} <> ''`
      )
    );

  const runs = new Map<string, {
    run_id: string;
    computer_name: string | null;
    linked_at_min: Date;
    linked_at_max: Date;
    expires_at: Date | null;
    controls: Set<string>;
    links_total: number;
    collection_errors: number;
  }>();

  for (const r of rows) {
    if (!r.runId) continue;
    const isError = (r.description ?? "").toLowerCase().startsWith("collection error");
    const computer = r.source?.startsWith("collector:")
      ? r.source.slice("collector:".length)
      : null;
    const linkedAt = r.linkedAt instanceof Date ? r.linkedAt : new Date(r.linkedAt);
    const expiresAt = r.expiresAt instanceof Date ? r.expiresAt : r.expiresAt ? new Date(r.expiresAt) : null;

    const entry = runs.get(r.runId);
    if (!entry) {
      runs.set(r.runId, {
        run_id: r.runId,
        computer_name: computer,
        linked_at_min: linkedAt,
        linked_at_max: linkedAt,
        expires_at: expiresAt,
        controls: new Set([r.controlRecordId]),
        links_total: 1,
        collection_errors: isError ? 1 : 0,
      });
    } else {
      entry.links_total += 1;
      if (isError) entry.collection_errors += 1;
      entry.controls.add(r.controlRecordId);
      if (linkedAt < entry.linked_at_min) entry.linked_at_min = linkedAt;
      if (linkedAt > entry.linked_at_max) entry.linked_at_max = linkedAt;
      if (expiresAt && (!entry.expires_at || expiresAt > entry.expires_at)) entry.expires_at = expiresAt;
      if (!entry.computer_name && computer) entry.computer_name = computer;
    }
  }

  const now = Date.now();
  const result: IngestHistoryRow[] = [...runs.values()]
    .map((r) => {
      const collectedAt = r.expires_at ? new Date(r.expires_at.getTime() - EXPIRY_DAYS * MS_PER_DAY) : null;
      const ageDays = collectedAt ? Math.floor((now - collectedAt.getTime()) / MS_PER_DAY) : null;
      const freshness: IngestHistoryRow["freshness"] =
        ageDays === null ? "unknown"
          : ageDays < STALE_DAYS ? "current"
          : ageDays < EXPIRY_DAYS ? "stale"
          : "expired";
      return {
        run_id: r.run_id,
        computer_name: r.computer_name,
        collected_at: collectedAt?.toISOString() ?? null,
        ingested_at: r.linked_at_max.toISOString(),
        expires_at: r.expires_at?.toISOString() ?? null,
        links_total: r.links_total,
        files_ok: r.links_total - r.collection_errors,
        collection_errors: r.collection_errors,
        controls_linked: r.controls.size,
        freshness,
      };
    })
    .sort((a, b) => new Date(b.ingested_at).getTime() - new Date(a.ingested_at).getTime());

  return NextResponse.json(result);
}
