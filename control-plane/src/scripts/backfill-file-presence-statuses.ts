/**
 * Backfill evidence_control_technical_status rows for historical
 * collect_cui_evidence_v2 / cui_evidence_manifest runs that landed
 * before the per-control file-presence evaluator was wired into
 * /api/evidence/v2/ingest.
 *
 * Walks every cui_evidence_manifest run with ZERO existing
 * evidence_control_technical_status rows. Reads the run's manifest
 * (which carries the file list), runs the same evaluator the live
 * ingest path now uses, and writes the per-control aggregate.
 *
 * Idempotent: skips runs that already have status rows. Safe to re-run.
 *
 * Run:
 *   railway run --service CMMC bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" \
 *      npx tsx src/scripts/backfill-file-presence-statuses.ts --confirm'
 *
 * Optional flags:
 *   --confirm       Required. Without it, prints the plan and exits.
 *   --org <uuid>    Scope to one org. Default: all orgs.
 *   --since <ISO>   Only backfill runs collected after this date.
 *                   Default: 90 days ago (matches TrainOS request).
 */

import { db } from "@/db";
import { evidenceRuns, evidenceControlTechnicalStatus } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { persistFilePresenceForRun } from "@/lib/evidence/per-control-file-presence";

const argv = process.argv.slice(2);
const confirm = argv.includes("--confirm");
const orgIdx = argv.indexOf("--org");
const orgFilter = orgIdx >= 0 ? argv[orgIdx + 1] : null;
const sinceIdx = argv.indexOf("--since");
const sinceArg = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;
const since = sinceArg
  ? new Date(sinceArg)
  : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

if (orgFilter && !/^[0-9a-f-]{36}$/i.test(orgFilter)) {
  console.error(`--org expects a uuid; got: ${orgFilter}`);
  process.exit(1);
}
if (Number.isNaN(since.getTime())) {
  console.error(`--since must be a valid ISO date`);
  process.exit(1);
}

async function run() {
  console.log("[backfill-file-presence-statuses] starting");
  console.log(`  scope: ${orgFilter ?? "ALL ORGS"}`);
  console.log(`  since: ${since.toISOString()}`);

  // Find every cui_evidence_manifest run since `since` that has no
  // evidence_control_technical_status rows yet.
  const candidates = await db
    .select({
      id: evidenceRuns.id,
      organizationId: evidenceRuns.organizationId,
      runId: evidenceRuns.runId,
      collectedAt: evidenceRuns.collectedAt,
      manifest: evidenceRuns.manifest,
    })
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.source, "cui_evidence_manifest"),
        gte(evidenceRuns.collectedAt, since),
        ...(orgFilter ? [eq(evidenceRuns.organizationId, orgFilter)] : []),
        sql`NOT EXISTS (
          SELECT 1 FROM ${evidenceControlTechnicalStatus} ects
          WHERE ects.evidence_run_id = ${evidenceRuns.id}
        )`
      )
    );

  console.log(`  candidates (manifest runs with no statuses yet): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("  nothing to backfill — all historical manifest runs already have statuses.");
    return;
  }

  if (!confirm) {
    console.log("");
    console.log("Dry run — pass --confirm to execute. Sample (first 5):");
    for (const c of candidates.slice(0, 5)) {
      const fileCount = Array.isArray(
        (c.manifest as { files?: unknown[] } | null)?.files
      )
        ? (c.manifest as { files: unknown[] }).files.length
        : 0;
      console.log(
        `    ${c.runId} (${c.collectedAt.toISOString().slice(0, 10)}, files=${fileCount})`
      );
    }
    return;
  }

  let processed = 0;
  let written = 0;
  let skipped = 0;
  let errors = 0;
  for (const c of candidates) {
    const m = c.manifest as { files?: Array<{ path?: string }> } | null;
    const files = Array.isArray(m?.files) ? m!.files! : [];
    const filtered = files
      .filter((f): f is { path: string } => typeof f?.path === "string")
      .map((f) => ({ path: f.path }));
    if (filtered.length === 0) {
      skipped++;
      continue;
    }
    try {
      const n = await persistFilePresenceForRun(c.id, filtered);
      written += n;
      processed++;
      if (processed % 10 === 0) {
        console.log(`  ...${processed}/${candidates.length} runs processed`);
      }
    } catch (e) {
      errors++;
      console.error(
        `  ERROR for run ${c.runId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  console.log("");
  console.log("[backfill-file-presence-statuses] complete:");
  console.log(`  runs processed:                  ${processed}`);
  console.log(`  runs skipped (no manifest files): ${skipped}`);
  console.log(`  runs with errors:                ${errors}`);
  console.log(`  total status rows written:       ${written}`);
}

run().catch((e) => {
  console.error("[backfill-file-presence-statuses] FAILED:", e);
  process.exit(1);
});
