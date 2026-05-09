/**
 * Phase A2 backfill — two operations, one script:
 *
 *   1. Populate objective_verdicts on every existing snapshot from the
 *      AG-authoritative per-control objective catalog
 *      (public/CMMC_SCTM_UI_Optimized.json). Today's coarse seeding:
 *      propagate the snapshot's aggregate_finding to every objective
 *      letter. The SSP gains the ability to render [a,d]-style claims
 *      even though the per-objective state is still uniform across
 *      objectives within a control. Phase B's rescore engine will
 *      eventually compute per-objective state from real evidence.
 *
 *   2. Create a draft POA&M stub for every NOT_MET control that
 *      doesn't already have an open POA&M attached. Per the customer's
 *      "outstanding → POA&M" rule. Stubs do NOT elevate the verdict —
 *      the customer must fill the AG-mandated fields and transition
 *      status='active' for the elevator to apply.
 *
 * Idempotent. Dry-run by default.
 *
 * Usage:
 *   npx tsx src/scripts/phase-a2-backfill.ts
 *     # dry run — counts only
 *
 *   npx tsx src/scripts/phase-a2-backfill.ts --confirm
 *     # executes
 *
 *   npx tsx src/scripts/phase-a2-backfill.ts --org=<slug-or-uuid> [--confirm]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  controlAdjudicationSnapshots,
  controlRecords,
  controls,
  organizations,
} from "@/db/schema";
import { ensureDraftPoamsForOrg } from "@/lib/canonical-state/auto-poam";

type Objective = { id: string; text: string };
type OptimizedControl = {
  id: string;
  title: string;
  objectives: Objective[];
};
type ObjectiveVerdictSeed = {
  objective: string;
  verdict: "MET" | "NOT_MET" | "NA";
  evidence_ids: string[];
  rationale: string | null;
};

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

async function loadObjectivesByControl(): Promise<Map<string, Objective[]>> {
  const filePath = path.join(
    process.cwd(),
    "public",
    "CMMC_SCTM_UI_Optimized.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as OptimizedControl[];
  const out = new Map<string, Objective[]>();
  for (const c of data) {
    // Catalog ids are CMMC-format ("AC.L2-3.1.1"); our snapshots use
    // NIST short ("3.1.1"). Translate by stripping the leading
    // "<FAMILY>.L<n>-".
    const nist = c.id.replace(/^[A-Z]+\.L\d-/, "");
    out.set(nist, c.objectives);
  }
  return out;
}

/**
 * Extract the objective letter from an id like "AC.L2-3.1.1-a" → "a".
 * Defensively returns "?" when the shape doesn't match.
 */
function extractObjectiveLetter(objectiveId: string): string {
  const parts = objectiveId.split("-");
  const tail = parts[parts.length - 1];
  return tail && /^[a-z]$/.test(tail) ? tail : "?";
}

async function backfillForOrg(
  orgId: string,
  slug: string,
  objectivesByControl: Map<string, Objective[]>,
  confirm: boolean,
): Promise<{
  snapshotsExamined: number;
  snapshotsUpdated: number;
  poamsCreated: number;
  poamsSkipped: number;
}> {
  // Pull every snapshot for the org with its current state.
  const snapshots = await db
    .select({
      id: controlAdjudicationSnapshots.id,
      controlId: controlAdjudicationSnapshots.controlId,
      aggregateFinding: controlAdjudicationSnapshots.aggregateFinding,
      objectiveVerdicts: controlAdjudicationSnapshots.objectiveVerdicts,
    })
    .from(controlAdjudicationSnapshots)
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId));

  let updated = 0;
  const notMetControlIds: string[] = [];

  for (const snap of snapshots) {
    if (snap.aggregateFinding === "NOT_MET") {
      notMetControlIds.push(snap.controlId);
    }

    const existing = (snap.objectiveVerdicts as ObjectiveVerdictSeed[]) ?? [];
    if (existing.length > 0) continue; // already populated by some other path

    const objectives = objectivesByControl.get(snap.controlId);
    if (!objectives || objectives.length === 0) continue; // unknown control

    // Coarse seed: every objective shares the requirement-level finding.
    // The SSP can already render per-objective tags from this; Phase B
    // refines per-objective state from real evidence.
    const verdict: "MET" | "NOT_MET" | "NA" = snap.aggregateFinding === "NA"
      ? "NA"
      : snap.aggregateFinding === "MET"
        ? "MET"
        : "NOT_MET";
    const seed: ObjectiveVerdictSeed[] = objectives.map((o) => ({
      objective: extractObjectiveLetter(o.id),
      verdict,
      evidence_ids: [],
      rationale: null,
    }));

    if (confirm) {
      await db
        .update(controlAdjudicationSnapshots)
        .set({ objectiveVerdicts: seed })
        .where(eq(controlAdjudicationSnapshots.id, snap.id));
    }
    updated++;
  }

  // Resolve titles for the NOT_MET stubs (just for nicer
  // weakness_description text on the auto-created POA&M).
  const titlesMap = new Map<string, string>();
  if (notMetControlIds.length > 0) {
    const titleRows = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
      })
      .from(controls)
      .where(
        sql`${controls.controlId} IN (${sql.join(
          notMetControlIds.map((c) => sql`${c}`),
          sql`, `,
        )})`,
      );
    for (const r of titleRows) titlesMap.set(r.controlId, r.title);
  }

  let poamsCreated = 0;
  let poamsSkipped = 0;
  if (confirm) {
    const r = await ensureDraftPoamsForOrg({
      organizationId: orgId,
      notMetControlIds,
      controlTitles: titlesMap,
    });
    poamsCreated = r.created;
    poamsSkipped = r.skipped;
    if (r.errored > 0) {
      console.error(`[${slug}] ${r.errored} POA&M creation(s) errored`);
    }
  } else {
    // Dry-run estimate: count NOT_METs that don't already have an open POA&M.
    // (We can't know skipped vs created without actually trying, so just
    // report the upper-bound count.)
    poamsCreated = notMetControlIds.length;
  }

  console.log(
    `[${slug}] examined=${snapshots.length}` +
      ` ${confirm ? "updated" : "would update"}=${updated}` +
      ` not_met=${notMetControlIds.length}` +
      ` ${confirm ? "POA&Ms_created" : "POA&Ms_(upper_bound)"}=${poamsCreated}` +
      (confirm ? ` POA&Ms_skipped=${poamsSkipped}` : ""),
  );
  return {
    snapshotsExamined: snapshots.length,
    snapshotsUpdated: updated,
    poamsCreated,
    poamsSkipped,
  };
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
    `${args.confirm ? "EXECUTING" : "DRY RUN"} — phase-a2-backfill${
      args.org ? ` (org=${args.org})` : " (all orgs)"
    }`,
  );

  const objectivesByControl = await loadObjectivesByControl();
  console.log(`Loaded objective catalog for ${objectivesByControl.size} controls.`);

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
    await backfillForOrg(t.id, t.slug ?? t.id, objectivesByControl, args.confirm);
  }
  console.log(args.confirm ? "" : "\nRe-run with --confirm to execute.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
