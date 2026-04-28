/**
 * Recompute persisted SPRS score for every organization.
 *
 * Why this exists: the SPRS calculator was previously deducting points
 * for controls marked `not_applicable`. The fix (commit 3319294) credits
 * NA controls properly tailored out via CMMC Scoping Guidance, but
 * `organizations.sprsScore` is only refreshed on the next control
 * status change. This script forces a one-time recompute so dashboards
 * reflect the corrected math immediately.
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx src/scripts/recompute-sprs-scores.ts            # dry-run
 *   npx tsx src/scripts/recompute-sprs-scores.ts --confirm  # execute
 */
import { db } from "../db";
import { organizations, controlRecords } from "../db/schema";
import { eq } from "drizzle-orm";
import { calculateSprsScore, type ControlImplementation } from "../lib/sprs/index";

const CONFIRM = process.argv.includes("--confirm");

const isSprsCredited = (s: string | null | undefined) =>
  s === "implemented" || s === "assessed" || s === "inherited" || s === "not_applicable";

async function main() {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, sprsScore: organizations.sprsScore })
    .from(organizations);

  console.log(
    `[recompute-sprs] examining ${orgs.length} organization(s) (mode=${
      CONFIRM ? "execute" : "dry-run"
    })`
  );

  let touched = 0;
  let unchanged = 0;
  const deltas: Array<{ org: string; before: number | null; after: number; diff: number }> = [];

  for (const org of orgs) {
    const records = await db
      .select({
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        sprs31311Condition: controlRecords.sprs31311Condition,
      })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, org.id));

    if (records.length === 0) {
      unchanged++;
      continue;
    }

    const implementations: ControlImplementation[] = records.map((r) => ({
      controlId: r.controlId,
      isImplemented: isSprsCredited(r.implementationStatus),
    }));

    const record31311 = records.find((r) => r.controlId === "3.13.11");
    const overrides: Record<string, number> = {};
    if (
      record31311 &&
      !isSprsCredited(record31311.implementationStatus) &&
      record31311.sprs31311Condition === "non_fips"
    ) {
      overrides["3.13.11"] = 3;
    }

    const next = calculateSprsScore(
      implementations,
      Object.keys(overrides).length > 0 ? overrides : undefined
    );

    if (next === org.sprsScore) {
      unchanged++;
      continue;
    }

    deltas.push({
      org: org.name,
      before: org.sprsScore,
      after: next,
      diff: next - (org.sprsScore ?? next),
    });

    if (CONFIRM) {
      await db
        .update(organizations)
        .set({ sprsScore: next })
        .where(eq(organizations.id, org.id));
    }
    touched++;
  }

  console.log(`[recompute-sprs] done`);
  console.log(`  touched   : ${touched}${CONFIRM ? " (written)" : " (would write)"}`);
  console.log(`  unchanged : ${unchanged}`);

  if (deltas.length > 0) {
    console.log(`\n[recompute-sprs] deltas:`);
    for (const d of deltas.slice(0, 50)) {
      const sign = d.diff > 0 ? "+" : "";
      console.log(`  ${d.org}: ${d.before ?? "null"} → ${d.after} (${sign}${d.diff})`);
    }
    if (deltas.length > 50) console.log(`  …and ${deltas.length - 50} more`);
  }

  if (!CONFIRM && touched > 0) {
    console.log(`\n[recompute-sprs] Re-run with --confirm to write these changes.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
