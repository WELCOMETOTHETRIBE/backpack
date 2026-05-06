/**
 * Wipe training progress before the new TrainOS evidence ingest goes live.
 *
 * Removes:
 *   1. training_records (manually-logged completions)
 *   2. governance_register_entries where register_key = 'training_completion'
 *      (defensive — keeps register DEFINITIONS, just clears any entries)
 *   3. artifacts where milestone_key LIKE 'AT.%' (empty awaiting_upload
 *      placeholders by default — pass --keep-artifacts to leave them)
 *
 * Does NOT touch:
 *   - governance_registers rows (the register definitions stay; TrainOS
 *     writes new entries into them)
 *   - users / control_records narratives / evidence_finding (no training
 *     data lives there per pre-flight survey)
 *
 * Refuses to run without --confirm. Wraps everything in a single
 * transaction so any failure rolls back. Prints before/after counts so
 * you can see exactly what changed.
 *
 * Run:
 *   railway run --service CMMC bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx src/scripts/wipe-training-progress.ts --confirm'
 *
 * Optional flags:
 *   --confirm          Required. Without it, prints the plan and exits.
 *   --keep-artifacts   Skip step 3 (leave AT.* artifact placeholders).
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const argv = process.argv.slice(2);
const confirm = argv.includes("--confirm");
const keepArtifacts = argv.includes("--keep-artifacts");

const sql = postgres(url, { max: 1 });

type Counts = {
  trainingRecords: number;
  registerEntries: number;
  atArtifacts: number;
};

async function counts(): Promise<Counts> {
  const tr = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM training_records`;
  const re = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c
    FROM governance_register_entries gre
    JOIN governance_registers gr ON gre.register_id = gr.id
    WHERE gr.register_key = 'training_completion'
  `;
  const ar = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM artifacts WHERE milestone_key LIKE 'AT.%'
  `;
  return {
    trainingRecords: tr[0].c,
    registerEntries: re[0].c,
    atArtifacts: ar[0].c,
  };
}

function printCounts(label: string, c: Counts) {
  console.log(`  ${label}:`);
  console.log(`    training_records:                                  ${c.trainingRecords}`);
  console.log(`    governance_register_entries (training_completion): ${c.registerEntries}`);
  console.log(`    artifacts (milestone_key LIKE 'AT.%'):             ${c.atArtifacts}`);
}

async function run() {
  console.log("[wipe-training-progress] starting");
  console.log(`  artifact wipe: ${keepArtifacts ? "SKIPPED (--keep-artifacts)" : "INCLUDED"}`);
  console.log("");

  const before = await counts();
  printCounts("before", before);

  if (!confirm) {
    console.log("");
    console.log("Dry run only — pass --confirm to execute the wipe.");
    await sql.end();
    process.exit(0);
  }

  console.log("");
  console.log("[wipe-training-progress] executing inside transaction...");

  // Manual BEGIN/COMMIT via sql.unsafe — postgres lib's sql.begin() typing
  // doesn't expose the tagged-template call signature on the tx parameter
  // in the way we need here, so we drive the transaction explicitly. Same
  // all-or-nothing guarantee.
  try {
    await sql.unsafe("BEGIN");

    const deletedTr = await sql.unsafe(
      "DELETE FROM training_records RETURNING id"
    );
    console.log(`  deleted training_records:        ${deletedTr.count}`);

    const deletedRe = await sql.unsafe(
      `DELETE FROM governance_register_entries
       WHERE register_id IN (
         SELECT id FROM governance_registers WHERE register_key = 'training_completion'
       ) RETURNING id`
    );
    console.log(`  deleted gov_register_entries:    ${deletedRe.count}`);

    if (!keepArtifacts) {
      const deletedAr = await sql.unsafe(
        "DELETE FROM artifacts WHERE milestone_key LIKE 'AT.%' RETURNING id"
      );
      console.log(`  deleted AT.* artifacts:          ${deletedAr.count}`);
    } else {
      console.log(`  AT.* artifacts:                  KEPT (--keep-artifacts)`);
    }

    await sql.unsafe("COMMIT");
  } catch (err) {
    await sql.unsafe("ROLLBACK").catch(() => {});
    throw err;
  }

  console.log("");

  const after = await counts();
  printCounts("after", after);

  if (
    after.trainingRecords !== 0 ||
    after.registerEntries !== 0 ||
    (!keepArtifacts && after.atArtifacts !== 0)
  ) {
    console.error("");
    console.error("[wipe-training-progress] WARNING: post-wipe counts non-zero — investigate");
    await sql.end();
    process.exit(2);
  }

  console.log("");
  console.log("[wipe-training-progress] complete. Slate is clean for TrainOS evidence ingest.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. SCTM should now show AT.L2-3.2.1 / .2.2 / .2.3 as outstanding.");
  console.log("  2. Run the TrainOS smoke test (handshake → first evidence delivery).");
  console.log("  3. Verify a fresh training_completion entry lands in the register.");
  await sql.end();
}

run().catch(async (err) => {
  console.error("[wipe-training-progress] FAILED:", err instanceof Error ? err.message : err);
  console.error("Transaction rolled back — no changes applied.");
  await sql.end().catch(() => {});
  process.exit(1);
});
