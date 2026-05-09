/**
 * Phase A0+ — backfill control_adjudication_snapshots.met_via +
 * .aggregate_finding from legacy control_records.implementation_status.
 *
 * Background
 * ----------
 * Phase A0 added met_via / aggregate_finding columns with a default of
 * 'evidence' / NULL. The canonical helper's empty-objectives shim then
 * fell back to the CAE rollup, which only reads register evidence —
 * undercounting the four AG-recognized MET-elevators (ESP inheritance,
 * enduring exception, DoD CIO adjudication, operational plan of
 * action) and operator-declared N/A.
 *
 * Result: customer's SCTM v1 said 96 done (80 implemented + 6 inherited
 * + 10 N/A); canonical helper said 46 MET. The 46 number was *too
 * conservative*, not honestly C3PAO-defensible. AG p.10–11 explicitly
 * accept inherited and N/A as MET-equivalent when documented in the
 * SSP.
 *
 * What this script does
 * ---------------------
 * For each snapshot in scope:
 *   1. Look up the matching control_records row.
 *   2. Translate legacy implementation_status → canonical (met_via +
 *      aggregate_finding):
 *
 *      legacy 'inherited'      → met_via='esp_inheritance',     finding='MET'
 *      legacy 'not_applicable' → met_via='not_applicable',      finding='NA'
 *      legacy 'implemented'    → met_via='evidence',            finding='MET'
 *      legacy 'assessed'       → met_via='evidence',            finding='MET'
 *      legacy 'in_progress'    → met_via='evidence',            finding='NOT_MET'
 *      legacy 'not_started'    → met_via='evidence',            finding='NOT_MET'
 *
 *   3. Skip rows whose met_via has already been set non-default
 *      (someone else owns those).
 *
 * Idempotent. Dry-run by default. Phase A2 will properly recompute via
 * the per-objective rescorer; until then this script ensures the
 * canonical helper returns honest numbers consistent with the
 * legacy SCTM v1.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-canonical-from-legacy.ts
 *     # dry run — prints proposed updates per org
 *
 *   npx tsx src/scripts/backfill-canonical-from-legacy.ts --confirm
 *     # executes
 *
 *   npx tsx src/scripts/backfill-canonical-from-legacy.ts --org=<slug-or-uuid> [--confirm]
 */
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationSnapshots,
  controlRecords,
  organizations,
} from "@/db/schema";

type Args = { org: string | null; confirm: boolean };
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { org: null, confirm: false };
  for (const a of argv) {
    if (a === "--confirm") out.confirm = true;
    else if (a.startsWith("--org=")) out.org = a.slice("--org=".length);
  }
  return out;
}

type Translation = { metVia: string; aggregateFinding: "MET" | "NOT_MET" | "NA" };

function translate(legacy: string): Translation | null {
  switch (legacy) {
    case "inherited":
      return { metVia: "esp_inheritance", aggregateFinding: "MET" };
    case "not_applicable":
      return { metVia: "not_applicable", aggregateFinding: "NA" };
    case "implemented":
    case "assessed":
      return { metVia: "evidence", aggregateFinding: "MET" };
    case "in_progress":
    case "not_started":
      return { metVia: "evidence", aggregateFinding: "NOT_MET" };
    default:
      return null;
  }
}

async function backfillForOrg(
  orgId: string,
  slug: string,
  confirm: boolean,
): Promise<{ updated: number; skipped: number; perFinding: Record<string, number> }> {
  // Pull every snapshot for the org, joined to its control_record so we
  // can read the legacy implementation_status and the inherited_from
  // signal at the same time.
  const rows = await db
    .select({
      snapshotId: controlAdjudicationSnapshots.id,
      controlId: controlAdjudicationSnapshots.controlId,
      currentMetVia: controlAdjudicationSnapshots.metVia,
      currentAggregate: controlAdjudicationSnapshots.aggregateFinding,
      legacyStatus: controlRecords.implementationStatus,
      inheritedFrom: controlRecords.inheritedFrom,
    })
    .from(controlAdjudicationSnapshots)
    .leftJoin(
      controlRecords,
      and(
        eq(controlRecords.organizationId, controlAdjudicationSnapshots.organizationId),
        eq(controlRecords.controlId, controlAdjudicationSnapshots.controlId),
      ),
    )
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId));

  let updated = 0;
  let skipped = 0;
  const perFinding: Record<string, number> = { MET: 0, NOT_MET: 0, NA: 0 };

  for (const r of rows) {
    if (!r.legacyStatus) {
      skipped++;
      continue;
    }
    const t = translate(r.legacyStatus);
    if (!t) {
      skipped++;
      continue;
    }
    // Already set to a non-default elevator? Don't disturb.
    const currentlyDefault =
      r.currentMetVia === "evidence" && r.currentAggregate === null;
    const wouldChange =
      r.currentMetVia !== t.metVia || r.currentAggregate !== t.aggregateFinding;
    if (!currentlyDefault && !wouldChange) {
      skipped++;
      continue;
    }

    perFinding[t.aggregateFinding]++;

    if (confirm) {
      await db
        .update(controlAdjudicationSnapshots)
        .set({ metVia: t.metVia, aggregateFinding: t.aggregateFinding })
        .where(eq(controlAdjudicationSnapshots.id, r.snapshotId));
    }
    updated++;
  }

  console.log(
    `[${slug}] ${confirm ? "updated" : "would update"} ${updated} snapshot(s); ` +
      `skipped ${skipped}; finding mix: MET=${perFinding.MET} NOT_MET=${perFinding.NOT_MET} NA=${perFinding.NA}`,
  );
  return { updated, skipped, perFinding };
}

async function resolveOrgId(input: string): Promise<{ id: string; slug: string } | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  const where = isUuid ? eq(organizations.id, input) : eq(organizations.slug, input);
  const [row] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(where)
    .limit(1);
  return row ?? null;
}

async function main() {
  const args = parseArgs();
  console.log(
    `${args.confirm ? "EXECUTING" : "DRY RUN"} — backfill-canonical-from-legacy${
      args.org ? ` (org=${args.org})` : " (all orgs)"
    }`,
  );

  const targets = args.org
    ? await (async () => {
        const t = await resolveOrgId(args.org!);
        if (!t) {
          console.error(`Org not found: ${args.org}`);
          process.exit(2);
        }
        return [t];
      })()
    : await db
        .select({ id: organizations.id, slug: organizations.slug })
        .from(organizations);

  for (const t of targets) {
    await backfillForOrg(t.id, t.slug ?? t.id, args.confirm);
  }
  console.log(args.confirm ? "" : "\nRe-run with --confirm to execute.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
