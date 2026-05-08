/**
 * Dedupe orphan CMMC-format control_records rows that should be NIST-form.
 *
 * Background
 * ----------
 * `control_records.controlId` is canonically NIST form (e.g. "3.6.1").
 * Until the bundle archive route fix on this branch, the IR tabletop
 * archive endpoint lazy-created control_records rows using the CMMC
 * display id (e.g. "IR.L2-3.6.1") because that's what
 * ir_exercise_controls.controlId stores. The result was orphan rows on
 * the SCTM list at /dashboard/controls — duplicates of the canonical
 * 110, with no title and stuck on NOT STARTED.
 *
 * What this script does
 * ---------------------
 * For each org, it finds every control_records row whose controlId
 * matches the CMMC pattern (^[A-Z]+\.L\d-\d\.\d+\.\d+$), then:
 *
 *   1. Computes the NIST form via controlIdToNist.
 *   2. Finds (or lazy-creates) the canonical NIST row for that org.
 *   3. Repoints all FK references from the bogus row → canonical row:
 *        - control_record_history (preserve audit trail)
 *        - control_evidence_links
 *        - governance_artifact_completions (de-dupe by artifact_label)
 *        - governance_control_links
 *        - artifacts
 *        - technical_evidence
 *        - poam_entries
 *   4. Carries forward max(lastValidationDate) onto canonical.
 *   5. Deletes the bogus row.
 *
 * Idempotent. Dry-run by default.
 *
 * Usage:
 *   npx tsx src/scripts/dedupe-cmmc-control-records.ts
 *     # dry run — prints proposed actions per org
 *
 *   npx tsx src/scripts/dedupe-cmmc-control-records.ts --confirm
 *     # executes inside one transaction per org
 *
 *   npx tsx src/scripts/dedupe-cmmc-control-records.ts --org <uuid> [--confirm]
 *     # narrow to a specific org
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  artifacts,
  controlEvidenceLinks,
  controlRecordHistory,
  controlRecords,
  governanceArtifactCompletions,
  governanceControlLinks,
  organizations,
  poamEntries,
  technicalEvidence,
} from "@/db/schema";
import { controlIdToNist } from "@/lib/compliance/controlId";

type Args = { confirm: boolean; orgId: string | null };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let confirm = false;
  let orgId: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--confirm") confirm = true;
    else if (arg === "--org" && argv[i + 1]) {
      orgId = argv[++i];
    }
  }
  return { confirm, orgId };
}

const CMMC_PATTERN = /^[A-Z]+\.L\d-\d\.\d+\.\d+$/;

async function dedupeForOrg(
  orgId: string,
  orgSlug: string,
  confirm: boolean,
): Promise<{ orphans: number; merged: number; created: number }> {
  // 1. Find all control_records for this org whose controlId is CMMC-form.
  const allRecs = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      lastValidationDate: controlRecords.lastValidationDate,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const orphans = allRecs.filter((r) => CMMC_PATTERN.test(r.controlId));
  if (orphans.length === 0) {
    return { orphans: 0, merged: 0, created: 0 };
  }

  console.log(
    `\n[${orgSlug}] ${orphans.length} orphan CMMC-form row(s):` +
      orphans.map((o) => `\n    ${o.controlId} → ${controlIdToNist(o.controlId)}`).join(""),
  );

  let merged = 0;
  let created = 0;

  for (const orphan of orphans) {
    const nistId = controlIdToNist(orphan.controlId);
    if (nistId === orphan.controlId) {
      console.log(`    ! skipping ${orphan.controlId} — normalizer returned same value`);
      continue;
    }

    // Look up the canonical NIST-form row.
    let canonical = allRecs.find((r) => r.controlId === nistId);

    if (!confirm) {
      // Dry-run reporting — count only.
      // Show what would be repointed.
      const ghacCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(governanceArtifactCompletions)
        .where(eq(governanceArtifactCompletions.controlRecordId, orphan.id));
      const histCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(controlRecordHistory)
        .where(eq(controlRecordHistory.controlRecordId, orphan.id));
      const linkCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(controlEvidenceLinks)
        .where(eq(controlEvidenceLinks.controlRecordId, orphan.id));
      const gclCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(governanceControlLinks)
        .where(eq(governanceControlLinks.controlRecordId, orphan.id));
      const artifactCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(artifacts)
        .where(eq(artifacts.controlRecordId, orphan.id));
      const techCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(technicalEvidence)
        .where(eq(technicalEvidence.controlRecordId, orphan.id));
      const poamCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(poamEntries)
        .where(eq(poamEntries.controlRecordId, orphan.id));
      console.log(
        `      would repoint:` +
          ` ${ghacCount[0]?.n ?? 0} completions, ${histCount[0]?.n ?? 0} history,` +
          ` ${linkCount[0]?.n ?? 0} evidence links, ${gclCount[0]?.n ?? 0} governance links,` +
          ` ${artifactCount[0]?.n ?? 0} artifacts, ${techCount[0]?.n ?? 0} technical evidence,` +
          ` ${poamCount[0]?.n ?? 0} POA&M entries` +
          ` → ${canonical ? "existing" : "newly-created"} ${nistId}`,
      );
      if (!canonical) created++;
      merged++;
      continue;
    }

    // ─── Confirm path ─────────────────────────────────────────────────
    await db.transaction(async (tx) => {
      // Lazy-create canonical NIST row if missing.
      if (!canonical) {
        const [created] = await tx
          .insert(controlRecords)
          .values({ organizationId: orgId, controlId: nistId })
          .returning({
            id: controlRecords.id,
            controlId: controlRecords.controlId,
            lastValidationDate: controlRecords.lastValidationDate,
          });
        canonical = created;
      }

      // Repoint control_record_history.
      await tx
        .update(controlRecordHistory)
        .set({ controlRecordId: canonical.id })
        .where(eq(controlRecordHistory.controlRecordId, orphan.id));

      // Repoint control_evidence_links.
      await tx
        .update(controlEvidenceLinks)
        .set({ controlRecordId: canonical.id })
        .where(eq(controlEvidenceLinks.controlRecordId, orphan.id));

      // Repoint governance_control_links.
      await tx
        .update(governanceControlLinks)
        .set({ controlRecordId: canonical.id })
        .where(eq(governanceControlLinks.controlRecordId, orphan.id));

      // Repoint artifacts.
      await tx
        .update(artifacts)
        .set({ controlRecordId: canonical.id })
        .where(eq(artifacts.controlRecordId, orphan.id));

      // Repoint technical_evidence.
      await tx
        .update(technicalEvidence)
        .set({ controlRecordId: canonical.id })
        .where(eq(technicalEvidence.controlRecordId, orphan.id));

      // Repoint poam_entries.
      await tx
        .update(poamEntries)
        .set({ controlRecordId: canonical.id })
        .where(eq(poamEntries.controlRecordId, orphan.id));

      // Repoint governance_artifact_completions — but de-dup against the
      // (control_record_id, artifact_label) unique. If the canonical row
      // already has the same artifact_label, keep the more-recently
      // attested one and drop the loser.
      const orphanCompletions = await tx
        .select({
          id: governanceArtifactCompletions.id,
          artifactLabel: governanceArtifactCompletions.artifactLabel,
          attestedAt: governanceArtifactCompletions.attestedAt,
        })
        .from(governanceArtifactCompletions)
        .where(eq(governanceArtifactCompletions.controlRecordId, orphan.id));

      for (const oc of orphanCompletions) {
        const [existing] = await tx
          .select({
            id: governanceArtifactCompletions.id,
            attestedAt: governanceArtifactCompletions.attestedAt,
          })
          .from(governanceArtifactCompletions)
          .where(
            and(
              eq(governanceArtifactCompletions.controlRecordId, canonical.id),
              eq(governanceArtifactCompletions.artifactLabel, oc.artifactLabel),
            ),
          )
          .limit(1);
        if (!existing) {
          // No conflict — just repoint.
          await tx
            .update(governanceArtifactCompletions)
            .set({ controlRecordId: canonical.id })
            .where(eq(governanceArtifactCompletions.id, oc.id));
        } else {
          // Conflict — keep the more recent. If orphan's is newer, delete
          // the canonical-side row first then repoint orphan's.
          const orphanNewer =
            (oc.attestedAt?.getTime() ?? 0) >
            (existing.attestedAt?.getTime() ?? 0);
          if (orphanNewer) {
            await tx
              .delete(governanceArtifactCompletions)
              .where(eq(governanceArtifactCompletions.id, existing.id));
            await tx
              .update(governanceArtifactCompletions)
              .set({ controlRecordId: canonical.id })
              .where(eq(governanceArtifactCompletions.id, oc.id));
          } else {
            // Existing canonical-side row wins — drop the orphan-side.
            await tx
              .delete(governanceArtifactCompletions)
              .where(eq(governanceArtifactCompletions.id, oc.id));
          }
        }
      }

      // Carry forward lastValidationDate (newer wins).
      const orphanLvd = orphan.lastValidationDate?.getTime() ?? 0;
      const canonicalLvd = canonical.lastValidationDate?.getTime() ?? 0;
      if (orphanLvd > canonicalLvd) {
        await tx
          .update(controlRecords)
          .set({
            lastValidationDate: orphan.lastValidationDate,
            updatedAt: new Date(),
          })
          .where(eq(controlRecords.id, canonical.id));
      }

      // Finally: delete the orphan. Cascades sweep up
      // control_record_history, control_evidence_links,
      // governance_control_links, and any remaining
      // governance_artifact_completions. The restrict-FK tables
      // (artifacts, technical_evidence, poam_entries) have already been
      // repointed above so they don't block.
      await tx
        .delete(controlRecords)
        .where(eq(controlRecords.id, orphan.id));
    });

    if (!allRecs.find((r) => r.controlId === nistId)) created++;
    merged++;
    console.log(`      ✓ merged ${orphan.controlId} → ${nistId}`);
  }

  return { orphans: orphans.length, merged, created };
}

async function main() {
  const args = parseArgs();
  console.log(
    `dedupe-cmmc-control-records: ${args.confirm ? "EXECUTING" : "DRY RUN"}` +
      (args.orgId ? ` (org=${args.orgId})` : " (all orgs)"),
  );

  const orgs = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(args.orgId ? eq(organizations.id, args.orgId) : sql`true`)
    .orderBy(desc(organizations.createdAt));

  let totalOrphans = 0;
  let totalMerged = 0;
  let totalCreated = 0;
  for (const org of orgs) {
    const { orphans, merged, created } = await dedupeForOrg(
      org.id,
      org.slug ?? org.id,
      args.confirm,
    );
    totalOrphans += orphans;
    totalMerged += merged;
    totalCreated += created;
  }

  console.log(
    `\nSummary: ${totalOrphans} orphan(s) across ${orgs.length} org(s);` +
      ` ${args.confirm ? "merged" : "would merge"} ${totalMerged};` +
      ` ${args.confirm ? "created" : "would create"} ${totalCreated} canonical row(s).`,
  );
  if (!args.confirm && totalOrphans > 0) {
    console.log("\nRe-run with --confirm to execute.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
