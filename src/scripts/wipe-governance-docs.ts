/**
 * Wipe governance documentation evidence (Option B targeted reset).
 *
 * Removes:
 *   1. governance_document_control_links — doc→control mappings
 *   2. governance_documents — the policy / SOP / SSP / charter rows
 *
 * Does NOT touch:
 *   - governance_register_entries (audit_log_review, vuln_remediation, etc.)
 *     — keep registers so we can see how many controls are still backed by
 *     the register lane alone after the doc lane is gone.
 *   - governance_artifact_completions — attestations / system pointers stay.
 *   - artifacts — upload artifacts stay (they're scoped per controlRecord).
 *   - training_records — already wiped in a prior script.
 *   - control_records implementation_status values — those flip naturally
 *     after a recalc, not via this script.
 *
 * Refuses to run without --confirm. Wraps everything in a single
 * transaction so any failure rolls back. Prints before/after counts.
 *
 * Run:
 *   railway run --service CMMC bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx src/scripts/wipe-governance-docs.ts --confirm'
 *
 * Optional flags:
 *   --confirm        Required. Without it, prints the plan and exits.
 *   --org <uuid>     Scope to one org. Default: MacTech (901cc0c7…).
 *
 * Aftermath: the canonical adjudication count will drop. Trigger a recalc
 * via /dashboard/readiness → "Recalculate control statuses" (or any
 * action that calls calculateControlStatus) to push the new state into
 * control_records.implementation_status.
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const argv = process.argv.slice(2);
const confirm = argv.includes("--confirm");
const orgIdx = argv.indexOf("--org");
const ORG_ID =
  orgIdx >= 0 && argv[orgIdx + 1]
    ? argv[orgIdx + 1]
    : "901cc0c7-79b1-466b-a402-14c3ec7771ff"; // MacTech default

if (!/^[0-9a-f-]{36}$/i.test(ORG_ID)) {
  console.error(`--org expects a uuid; got: ${ORG_ID}`);
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

type Counts = {
  documents: number;
  documentsNonDraft: number;
  links: number;
  linksDistinctControls: number;
};

async function counts(): Promise<Counts> {
  const docs = await sql<{ c: number; nd: number }[]>`
    SELECT COUNT(*)::int AS c,
           COUNT(*) FILTER (WHERE status != 'DRAFT')::int AS nd
    FROM governance_documents WHERE organization_id = ${ORG_ID}
  `;
  const links = await sql<{ c: number; d: number }[]>`
    SELECT COUNT(*)::int AS c,
           COUNT(DISTINCT control_id)::int AS d
    FROM governance_document_control_links WHERE organization_id = ${ORG_ID}
  `;
  return {
    documents: docs[0].c,
    documentsNonDraft: docs[0].nd,
    links: links[0].c,
    linksDistinctControls: links[0].d,
  };
}

function printCounts(label: string, c: Counts) {
  console.log(`  ${label}:`);
  console.log(`    governance_documents (total / non-DRAFT):     ${c.documents} / ${c.documentsNonDraft}`);
  console.log(`    governance_document_control_links (rows):     ${c.links}`);
  console.log(`    governance_document_control_links (distinct controls): ${c.linksDistinctControls}`);
}

async function run() {
  console.log("[wipe-governance-docs] starting");
  console.log(`  scope: org ${ORG_ID}`);
  console.log("  preserves: register entries, artifact completions, attestations, artifacts");
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
  console.log("[wipe-governance-docs] executing inside transaction...");

  try {
    await sql.unsafe("BEGIN");

    // 1. Wipe doc→control links first. They reference governance_documents
    // only by docCode (text), so order isn't strictly required, but
    // deleting links first matches the dependency direction the
    // governance UI uses.
    const deletedLinks = await sql.unsafe(
      `DELETE FROM governance_document_control_links
       WHERE organization_id = $1 RETURNING id`,
      [ORG_ID]
    );
    console.log(`  deleted control_links:           ${deletedLinks.count}`);

    // 2. Wipe the documents themselves.
    const deletedDocs = await sql.unsafe(
      `DELETE FROM governance_documents
       WHERE organization_id = $1 RETURNING id`,
      [ORG_ID]
    );
    console.log(`  deleted governance_documents:    ${deletedDocs.count}`);

    await sql.unsafe("COMMIT");
  } catch (err) {
    await sql.unsafe("ROLLBACK").catch(() => {});
    throw err;
  }

  console.log("");

  const after = await counts();
  printCounts("after", after);

  if (after.documents !== 0 || after.links !== 0) {
    console.error("");
    console.error("[wipe-governance-docs] WARNING: post-wipe counts non-zero — investigate");
    await sql.end();
    process.exit(2);
  }

  console.log("");
  console.log("[wipe-governance-docs] complete.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. /dashboard/readiness → click 'Recalculate control statuses'");
  console.log("     (or upload any artifact / save any wizard — anything that triggers");
  console.log("     calculateControlStatus). The Overview adjudicated count will drop");
  console.log("     by however many controls were satisfied via the doc lane alone.");
  console.log("  2. SCTM will surface the newly-outstanding controls in their bins.");
  console.log("  3. Register entries + artifact completions + attestations are preserved,");
  console.log("     so any control still backed by those lanes stays adjudicated.");
  await sql.end();
}

run().catch(async (err) => {
  console.error("[wipe-governance-docs] FAILED:", err instanceof Error ? err.message : err);
  console.error("Transaction rolled back — no changes applied.");
  await sql.end().catch(() => {});
  process.exit(1);
});
