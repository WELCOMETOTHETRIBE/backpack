/**
 * Apply 0082 r10_break_glass_activations migration.
 *
 * Same idempotent-statements workaround as other apply-* scripts in this
 * directory — the drizzle journal is corrupt so we re-emit each CREATE
 * as IF-NOT-EXISTS on every deploy via `npm run release`.
 *
 * Statements mirror drizzle/0082_r10_break_glass_activations.sql verbatim.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-r10-break-glass-migration.ts
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
    label: "0082 r10_break_glass_activations table",
    sql: `CREATE TABLE IF NOT EXISTS r10_break_glass_activations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
      external_activation_id text NOT NULL,
      activator_principal text NOT NULL,
      activated_role text NOT NULL,
      activation_started_at timestamptz NOT NULL,
      activation_ends_at timestamptz,
      activation_reason text,
      pim_approver_principal text,
      mfa_claim text,
      status varchar(32) NOT NULL DEFAULT 'pending_review',
      reviewed_at timestamptz,
      reviewed_by_id uuid REFERENCES users(id),
      review_notes text,
      source_event jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );`,
  },
  {
    label: "0082 external_activation_id unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS r10_break_glass_activations_external_unique
      ON r10_break_glass_activations (organization_id, external_activation_id);`,
  },
  {
    label: "0082 status idx",
    sql: `CREATE INDEX IF NOT EXISTS r10_break_glass_activations_status_idx
      ON r10_break_glass_activations (organization_id, status, activation_started_at DESC);`,
  },
  {
    label: "0082 activator idx",
    sql: `CREATE INDEX IF NOT EXISTS r10_break_glass_activations_activator_idx
      ON r10_break_glass_activations (organization_id, activator_principal);`,
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
