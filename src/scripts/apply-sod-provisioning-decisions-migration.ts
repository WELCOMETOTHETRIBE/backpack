/**
 * Apply 0083 sod_provisioning_decisions migration.
 *
 * Same idempotent-statements workaround as other apply-* scripts.
 * Statements mirror drizzle/0083_sod_provisioning_decisions.sql verbatim.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-sod-provisioning-decisions-migration.ts
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
    label: "0083 sod_provisioning_decisions table",
    sql: `CREATE TABLE IF NOT EXISTS sod_provisioning_decisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
      subject_principal text NOT NULL,
      target_group text NOT NULL,
      existing_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
      resulting_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      decision varchar(32) NOT NULL,
      conflict_pair_a varchar(8),
      conflict_pair_b varchar(8),
      reason text,
      requested_by_principal text,
      triggered_via varchar(16) NOT NULL,
      request_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );`,
  },
  {
    label: "0083 org_decision idx",
    sql: `CREATE INDEX IF NOT EXISTS sod_provisioning_decisions_org_decision_idx
      ON sod_provisioning_decisions (organization_id, decision, created_at DESC);`,
  },
  {
    label: "0083 principal idx",
    sql: `CREATE INDEX IF NOT EXISTS sod_provisioning_decisions_principal_idx
      ON sod_provisioning_decisions (organization_id, subject_principal, created_at DESC);`,
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
