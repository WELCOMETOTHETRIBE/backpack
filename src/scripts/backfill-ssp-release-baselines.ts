/**
 * Backfill ssp_release_baselines for already-released submissions.
 *
 * Phase 1 of the controlled-baseline feature creates baselines on
 * the QMS-manifest-ingest path. Submissions that were released
 * BEFORE that hook landed have no baseline — this script walks them
 * and calls createOrGetReleaseBaseline for each, in chronological
 * order so supersession is applied correctly (older releases get
 * marked superseded by newer ones for the same boundary).
 *
 * Idempotent: re-running is safe. The unique index on
 * ssp_doc_control_submission_id short-circuits second-pass calls
 * via createOrGetReleaseBaseline's existing-row check.
 *
 * Run:
 *   DATABASE_URL='postgresql://…' \
 *     npx tsx src/scripts/backfill-ssp-release-baselines.ts
 *
 * Add --dry-run to print what would be created without writing:
 *   npx tsx src/scripts/backfill-ssp-release-baselines.ts --dry-run
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  sspDocControlSubmissions,
  sspDocuments,
  sspReleaseBaselines,
} from "@/db/schema";
import { createOrGetReleaseBaseline } from "@/lib/ssp/release-baseline";

const DRY_RUN = process.argv.includes("--dry-run");

(async () => {
  // Find released submissions that don't yet have a baseline. LEFT
  // JOIN with NULL filter is the standard "missing rows" pattern.
  const orphans = await db
    .select({
      submissionId: sspDocControlSubmissions.id,
      organizationId: sspDocControlSubmissions.organizationId,
      sspDocumentId: sspDocControlSubmissions.sspDocumentId,
      qmsDocumentNumber: sspDocControlSubmissions.qmsDocumentNumber,
      qmsSha256: sspDocControlSubmissions.qmsSha256,
      releasedAt: sspDocControlSubmissions.releasedAt,
      versionNumber: sspDocuments.versionNumber,
    })
    .from(sspDocControlSubmissions)
    .innerJoin(
      sspDocuments,
      eq(sspDocuments.id, sspDocControlSubmissions.sspDocumentId),
    )
    .leftJoin(
      sspReleaseBaselines,
      eq(
        sspReleaseBaselines.sspDocControlSubmissionId,
        sspDocControlSubmissions.id,
      ),
    )
    .where(
      and(
        eq(sspDocControlSubmissions.status, "released"),
        isNull(sspReleaseBaselines.id),
      ),
    )
    // Chronological so supersession marks older releases superseded
    // by newer ones (per createOrGetReleaseBaseline's logic).
    .orderBy(asc(sspDocControlSubmissions.releasedAt));

  console.log(
    `Found ${orphans.length} released submission(s) missing a release baseline.`,
  );

  if (orphans.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: would create the following baselines:\n");
    for (const o of orphans) {
      console.log(
        `  org=${o.organizationId.slice(0, 8)}…  ssp_v${o.versionNumber}  qms=${o.qmsDocumentNumber ?? "—"}  released=${o.releasedAt?.toISOString() ?? "—"}`,
      );
    }
    process.exit(0);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const o of orphans) {
    if (!o.qmsDocumentNumber || !o.qmsSha256 || !o.releasedAt) {
      console.warn(
        `  SKIP submission ${o.submissionId}: missing released metadata (qms_document_number / qms_sha256 / released_at)`,
      );
      skipped += 1;
      continue;
    }
    try {
      const result = await db.transaction(async (tx) => {
        return await createOrGetReleaseBaseline(tx, {
          organizationId: o.organizationId,
          sspDocumentId: o.sspDocumentId,
          sspDocControlSubmissionId: o.submissionId,
          qmsDocumentNumber: o.qmsDocumentNumber!,
          qmsSha256: o.qmsSha256!,
          releasedAt: o.releasedAt!,
          qmsManifestRunId: null,
          releaseNotes: "Backfilled from released submission (post-hoc).",
        });
      });
      if (result.created) {
        created += 1;
        console.log(
          `  + ${result.baselineId.slice(0, 8)}…  ssp_v${o.versionNumber}  qms=${o.qmsDocumentNumber}  superseded=${result.supersededBaselineIds.length}`,
        );
      } else {
        skipped += 1;
        console.log(
          `  = ${result.baselineId.slice(0, 8)}…  already existed (idempotent)`,
        );
      }
    } catch (err) {
      failed += 1;
      console.error(
        `  ! submission ${o.submissionId} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\nBackfill complete: ${created} created, ${skipped} skipped, ${failed} failed.`,
  );
  // Sanity check: count baselines that actually exist now.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sspReleaseBaselines);
  console.log(`Total baselines in DB: ${count}`);

  process.exit(failed > 0 ? 1 : 0);
})();
