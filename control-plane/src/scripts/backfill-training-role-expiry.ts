/**
 * Backfill role + expiry on existing training_records rows.
 *
 * Why this exists: the original /api/training/completion ingestion path
 * (used by MacTech Training and any future LMS bridge) sent
 * `expires_at: null` and didn't send `user_role` at all. The Training
 * register UI renders both columns, so existing rows show blank ROLE
 * and blank EXPIRY even though CMMC AT.L2-3.2.1/3.2.2/3.2.3 are all
 * annual cycles applied to a known audience.
 *
 * The forward fix is in the bridge + the completion route. This script
 * cleans up the rows that were already inserted before those fixes
 * shipped.
 *
 * Backfill rules:
 *   - user_role from training_type:
 *       security_awareness → "All Users"
 *       insider_threat     → "All Users"
 *       role_based         → "Privileged User"
 *       other              → leave null (we don't know the audience)
 *   - expires_at = completed_at + 1 year, ONLY when expires_at is null.
 *     We never overwrite an explicit value.
 *
 * Idempotent — safe to re-run; rows that already have role + expiry
 * set are skipped.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-training-role-expiry.ts            # dry-run
 *   npx tsx src/scripts/backfill-training-role-expiry.ts --confirm  # execute
 */
import { db } from "../db";
import { trainingRecords } from "../db/schema";
import { eq } from "drizzle-orm";

const CONFIRM = process.argv.includes("--confirm");

function roleFromType(trainingType: string): string | null {
  switch (trainingType) {
    case "security_awareness":
    case "insider_threat":
      return "All Users";
    case "role_based":
      return "Privileged User";
    default:
      return null;
  }
}

function plusOneYear(completedAt: string): string {
  // completedAt is a date string "YYYY-MM-DD"; bump the year
  // arithmetically so we don't get tripped up by timezone offsets.
  const d = new Date(`${completedAt}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const rows = await db
    .select({
      id: trainingRecords.id,
      organizationId: trainingRecords.organizationId,
      personnelName: trainingRecords.personnelName,
      trainingType: trainingRecords.trainingType,
      courseTitle: trainingRecords.courseTitle,
      completedAt: trainingRecords.completedAt,
      expiresAt: trainingRecords.expiresAt,
      userRole: trainingRecords.userRole,
    })
    .from(trainingRecords);

  console.log(
    `[backfill-training] examining ${rows.length} training_records (mode=${
      CONFIRM ? "execute" : "dry-run"
    })`
  );

  let touched = 0;
  let skipped = 0;
  const samples: Array<{
    id: string;
    name: string;
    course: string;
    before: { userRole: string | null; expiresAt: string | null };
    after: { userRole: string | null; expiresAt: string | null };
  }> = [];

  for (const r of rows) {
    const nextRole = r.userRole ?? roleFromType(r.trainingType);
    const nextExpiry = r.expiresAt ?? plusOneYear(r.completedAt);

    const willChange =
      nextRole !== r.userRole || nextExpiry !== r.expiresAt;
    if (!willChange) {
      skipped++;
      continue;
    }

    const update: Partial<{ userRole: string; expiresAt: string }> = {};
    if (nextRole && nextRole !== r.userRole) update.userRole = nextRole;
    if (nextExpiry !== r.expiresAt) update.expiresAt = nextExpiry;

    samples.push({
      id: r.id,
      name: r.personnelName,
      course: r.courseTitle,
      before: { userRole: r.userRole, expiresAt: r.expiresAt },
      after: {
        userRole: update.userRole ?? r.userRole,
        expiresAt: update.expiresAt ?? r.expiresAt,
      },
    });

    if (CONFIRM) {
      await db
        .update(trainingRecords)
        .set(update)
        .where(eq(trainingRecords.id, r.id));
    }
    touched++;
  }

  console.log(`[backfill-training] done`);
  console.log(`  touched : ${touched}${CONFIRM ? " (written)" : " (would write)"}`);
  console.log(`  skipped : ${skipped} (already had both fields)`);

  if (samples.length > 0) {
    console.log(`\n[backfill-training] sample (first 10):`);
    for (const s of samples.slice(0, 10)) {
      console.log(
        `  ${s.name} · ${s.course}: ${JSON.stringify(s.before)} → ${JSON.stringify(s.after)}`
      );
    }
  }

  if (!CONFIRM && touched > 0) {
    console.log(
      `\n[backfill-training] Re-run with --confirm to write these changes.`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
