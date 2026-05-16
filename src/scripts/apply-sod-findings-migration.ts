/**
 * Apply 0081 sod_findings migration.
 *
 * Same workaround as the other apply-* scripts in this directory: the
 * drizzle journal in this codebase has been corrupt since a prior
 * sprint, so `drizzle-kit migrate` no-ops on hand-written SQL files.
 * Re-emit 0081's statements as idempotent CREATE / ALTER calls and
 * run on every deploy via `npm run release`.
 *
 * Statements mirror drizzle/0081_sod_findings.sql verbatim. Keep them
 * in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-sod-findings-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  {
    label: "0081 sod_findings table",
    sql: `CREATE TABLE IF NOT EXISTS sod_findings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
      subject_principal text NOT NULL,
      role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      pair_role_a varchar(8) NOT NULL,
      pair_role_b varchar(8) NOT NULL,
      disposition_type varchar(32) NOT NULL,
      severity varchar(16) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'open',
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      closed_by_id uuid REFERENCES users(id),
      justification_text text,
      source_scan_run_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );`,
  },
  {
    label: "0081 sod_findings_open_unique partial index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS sod_findings_open_unique
      ON sod_findings (organization_id, subject_principal, pair_role_a, pair_role_b)
      WHERE status = 'open';`,
  },
  {
    label: "0081 sod_findings_org_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS sod_findings_org_status_idx
      ON sod_findings (organization_id, status, opened_at DESC);`,
  },
  {
    label: "0081 sod_findings_principal_idx",
    sql: `CREATE INDEX IF NOT EXISTS sod_findings_principal_idx
      ON sod_findings (organization_id, subject_principal);`,
  },
];

async function main() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      console.log(`  ✓ ${stmt.label}`);
      applied += 1;
    } catch (err) {
      console.error(`  ✗ ${stmt.label}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }
  console.log(`\nApplied ${applied}/${STMTS.length} statements.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
