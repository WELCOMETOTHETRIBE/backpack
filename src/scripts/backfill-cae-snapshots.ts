/**
 * Backfill control_adjudication_snapshots for an org.
 *
 * Background
 * ----------
 * /dashboard/cae shows the per-control verdict from the Phase 7 Control
 * Adjudication Engine. The dispatcher hook in
 * src/lib/evidence-engine/isso-export/dispatcher.ts calls
 * scoreControl + persistAdjudication for every control_touched on
 * every ISSO weekly export ingest — meaning the table self-populates
 * next week.
 *
 * But orgs whose most recent ingest predates the dispatcher hook (Phase
 * 7 CAE landed in commit a610198 on 2026-05-05 20:42 -0700) have empty
 * snapshot rows until their next ingest fires. The page reads honestly
 * but unhelpfully — 110/110 NO DATA.
 *
 * This script does the one-shot backfill: scoreAndPersistAll for the
 * org, writing manual-mode snapshots (manifest_id IS NULL → keyed on
 * the literal "__manual__" via the unique index). When the next real
 * ingest lands, it writes manifest-keyed snapshots that supersede
 * these in the latest-row read.
 *
 * Idempotent. Dry-run by default.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-cae-snapshots.ts --org=<slug-or-uuid>
 *     # dry run — prints control list + counts
 *
 *   npx tsx src/scripts/backfill-cae-snapshots.ts --org=<slug-or-uuid> --confirm
 *     # executes
 *
 *   npx tsx src/scripts/backfill-cae-snapshots.ts --all --confirm
 *     # backfill every org with zero snapshots
 *
 *   npx tsx src/scripts/backfill-cae-snapshots.ts --org=<...> --manifest=<id>
 *     # use a specific manifest_id as the period basis (rare; usually
 *     # you want manual mode and let the next ingest overwrite)
 */
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationSnapshots,
  organizations,
} from "@/db/schema";
import {
  scoreAndPersistAll,
} from "@/lib/evidence-engine/adjudication/scorer";

type Args = {
  org: string | null;
  all: boolean;
  manifestId: string | null;
  confirm: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { org: null, all: false, manifestId: null, confirm: false };
  for (const a of argv) {
    if (a === "--confirm") out.confirm = true;
    else if (a === "--all") out.all = true;
    else if (a.startsWith("--org=")) out.org = a.slice("--org=".length);
    else if (a.startsWith("--manifest=")) {
      out.manifestId = a.slice("--manifest=".length);
    }
  }
  return out;
}

async function resolveOrgId(input: string): Promise<{ id: string; slug: string } | null> {
  // Accept either a UUID or a slug.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
  const where = isUuid
    ? eq(organizations.id, input)
    : eq(organizations.slug, input);
  const [row] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(where)
    .limit(1);
  return row ?? null;
}

async function backfillForOrg(
  orgId: string,
  slug: string,
  manifestId: string | null,
  confirm: boolean,
): Promise<{ existing: number; written: number }> {
  // How many snapshots exist already?
  const [{ n: existing }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(controlAdjudicationSnapshots)
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId));

  console.log(
    `\n[${slug}] orgId=${orgId} existing snapshots=${existing}` +
      (manifestId ? ` (will key to manifest=${manifestId})` : " (manual mode)"),
  );

  if (!confirm) {
    console.log(`    DRY RUN — would scoreAndPersistAll for this org.`);
    return { existing, written: 0 };
  }

  const results = await scoreAndPersistAll({
    orgId,
    manifestId: manifestId ?? undefined,
  });
  console.log(
    `    ✓ wrote/updated ${results.length} snapshot row(s)` +
      ` (status mix: ${countByStatus(results)})`,
  );
  return { existing, written: results.length };
}

function countByStatus(
  rows: Array<{ status: string }>,
): string {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.status] = (m[r.status] ?? 0) + 1;
  return Object.entries(m)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

async function main() {
  const args = parseArgs();
  if (!args.org && !args.all) {
    console.error("Specify --org=<slug-or-uuid> or --all.");
    process.exit(2);
  }

  let targets: { id: string; slug: string }[] = [];
  if (args.org) {
    const t = await resolveOrgId(args.org);
    if (!t) {
      console.error(`Org not found: ${args.org}`);
      process.exit(2);
    }
    targets = [t];
  } else {
    // --all: every org with zero existing snapshots.
    const rows = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .leftJoin(
        controlAdjudicationSnapshots,
        eq(controlAdjudicationSnapshots.organizationId, organizations.id),
      )
      .where(isNull(controlAdjudicationSnapshots.id));
    // Distinct (left-join can repeat).
    const seen = new Set<string>();
    targets = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  console.log(
    `${args.confirm ? "EXECUTING" : "DRY RUN"} — ${targets.length} org(s):`,
    targets.map((t) => t.slug).join(", ") || "(none)",
  );

  let totalWritten = 0;
  for (const t of targets) {
    const { written } = await backfillForOrg(
      t.id,
      t.slug,
      args.manifestId,
      args.confirm,
    );
    totalWritten += written;
  }

  console.log(
    `\nSummary: ${args.confirm ? "wrote" : "would write"} snapshots for ${
      targets.length
    } org(s); total rows ${args.confirm ? "written" : "(dry run)"}: ${totalWritten}.`,
  );
  if (!args.confirm) console.log("Re-run with --confirm to execute.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
