/**
 * Backfill the policy_review_log register from already-released SSP
 * submissions.
 *
 * Companion to the forward path in
 * src/lib/ssp/seed-policy-review-from-release.ts, which auto-seeds the
 * register entry inside the Doc Control linker transaction. Submissions
 * that were released BEFORE that forward hook landed have no register
 * entry — this script walks them and calls
 * seedPolicyReviewEntryFromRelease for each.
 *
 * Idempotent: re-running is safe. The helper's idempotency check
 * (entry_data->>'source_submission_id') short-circuits the second pass.
 *
 * After seeding, the script calls recomputePolicyReviewAffectedControls
 * once per affected org so the dashboard reflects the new evidence.
 *
 * Run:
 *   DATABASE_URL='postgresql://…' \
 *     npx tsx src/scripts/backfill-policy-review-from-releases.ts
 *
 * Add --dry-run to print what would be seeded without writing:
 *   npx tsx src/scripts/backfill-policy-review-from-releases.ts --dry-run
 */
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { sspDocControlSubmissions, sspDocuments } from "@/db/schema";
import {
  seedPolicyReviewEntryFromRelease,
  recomputePolicyReviewAffectedControls,
} from "@/lib/ssp/seed-policy-review-from-release";

const DRY_RUN = process.argv.includes("--dry-run");

(async () => {
  const releases = await db
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
    .where(and(eq(sspDocControlSubmissions.status, "released")))
    .orderBy(asc(sspDocControlSubmissions.releasedAt));

  console.log(
    `Found ${releases.length} released SSP submission(s) to consider.`,
  );

  if (releases.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: would seed policy_review_log entries for:\n");
    for (const r of releases) {
      console.log(
        `  org=${r.organizationId.slice(0, 8)}…  ssp_v${r.versionNumber}  qms=${r.qmsDocumentNumber ?? "—"}  released=${r.releasedAt?.toISOString() ?? "—"}`,
      );
    }
    process.exit(0);
  }

  let created = 0;
  let duplicate = 0;
  let skipped = 0;
  let failed = 0;
  const affectedOrgs = new Set<string>();

  for (const r of releases) {
    if (!r.qmsDocumentNumber || !r.qmsSha256 || !r.releasedAt) {
      console.warn(
        `  SKIP submission ${r.submissionId}: missing released metadata (qms_document_number / qms_sha256 / released_at)`,
      );
      skipped += 1;
      continue;
    }
    try {
      const result = await db.transaction(async (tx) =>
        seedPolicyReviewEntryFromRelease(tx, {
          organizationId: r.organizationId,
          sspDocumentId: r.sspDocumentId,
          sspDocControlSubmissionId: r.submissionId,
          qmsDocumentNumber: r.qmsDocumentNumber!,
          qmsSha256: r.qmsSha256!,
          releasedAt: r.releasedAt!,
        }),
      );
      switch (result.kind) {
        case "created":
          created += 1;
          affectedOrgs.add(r.organizationId);
          console.log(
            `  + ${result.entryId.slice(0, 8)}…  ssp_v${r.versionNumber}  qms=${r.qmsDocumentNumber}`,
          );
          break;
        case "duplicate":
          duplicate += 1;
          console.log(
            `  = ${result.entryId.slice(0, 8)}…  already seeded (idempotent)`,
          );
          break;
        case "skipped":
          skipped += 1;
          console.warn(
            `  SKIP submission ${r.submissionId}: ${result.reason}`,
          );
          break;
      }
    } catch (err) {
      failed += 1;
      console.error(
        `  ! submission ${r.submissionId} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\nSeed pass complete: ${created} created, ${duplicate} duplicate (skipped), ${skipped} skipped, ${failed} failed.`,
  );

  // Recompute affected controls once per org with new entries.
  for (const orgId of affectedOrgs) {
    try {
      const recompute = await recomputePolicyReviewAffectedControls(orgId);
      console.log(
        `  ↻ org=${orgId.slice(0, 8)}…  recalculated ${recompute.recalculated} control(s)` +
          (recompute.errors.length > 0
            ? `, errors: ${recompute.errors.join("; ")}`
            : ""),
      );
    } catch (err) {
      console.error(
        `  ! org=${orgId.slice(0, 8)}… recompute failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  process.exit(failed > 0 ? 1 : 0);
})();
