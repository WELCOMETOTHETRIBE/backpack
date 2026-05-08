/**
 * Apply Sprint 9 TrainOS integration migration (0063).
 *
 * Same workaround as apply-adjudication-migrations.ts: the drizzle journal
 * in this codebase has been corrupt since a prior sprint, so
 * `drizzle-kit migrate` no-ops on hand-written SQL files. Re-emit the
 * Sprint 9 statements as idempotent CREATE / ALTER calls and run on every
 * deploy via `npm run release`.
 *
 * Statements mirror drizzle/0063_trainos_integration.sql verbatim. Keep
 * them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-trainos-migrations.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  // ── 0063: Sprint 9 TrainOS integration — onboarding columns + delivery dedup ──
  {
    label: "0063 organizations.trainos_tenant_id column",
    sql: `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trainos_tenant_id text`,
  },
  {
    label: "0063 organizations.trainos_tenant_id unique constraint",
    // Wrap in DO block so re-runs don't error when the constraint already exists.
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'organizations_trainos_tenant_id_key'
        ) THEN
          ALTER TABLE organizations ADD CONSTRAINT organizations_trainos_tenant_id_key UNIQUE (trainos_tenant_id);
        END IF;
      END $$`,
  },
  {
    label: "0063 organizations.trainos_webhook_secret column",
    sql: `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trainos_webhook_secret text`,
  },
  {
    label: "0063 trainos_deliveries table",
    sql: `CREATE TABLE IF NOT EXISTS trainos_deliveries (
      delivery_id          uuid PRIMARY KEY,
      organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event                varchar(80) NOT NULL,
      schema_version       varchar(8),
      canonicalization_ver varchar(8),
      evidence_record_id   text NOT NULL,
      evidence_hash        text NOT NULL,
      certificate_number   text,
      occurred_at          timestamptz NOT NULL,
      verdict_response     jsonb NOT NULL,
      verdict_overall      varchar(32) NOT NULL,
      request_body_hash    text NOT NULL,
      received_at          timestamptz NOT NULL DEFAULT now(),
      sandbox              boolean NOT NULL DEFAULT false
    )`,
  },
  {
    label: "0063 trainos_deliveries org+received idx",
    sql: `CREATE INDEX IF NOT EXISTS trainos_deliveries_org_received_idx
      ON trainos_deliveries(organization_id, received_at DESC)`,
  },
  {
    label: "0063 trainos_deliveries evidence_record idx",
    sql: `CREATE INDEX IF NOT EXISTS trainos_deliveries_evidence_record_idx
      ON trainos_deliveries(evidence_record_id)`,
  },
];

async function run() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      applied++;
      console.log(`[trainos-migrations] applied: ${stmt.label}`);
    } catch (err) {
      console.error(
        `[trainos-migrations] FAILED: ${stmt.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
  console.log(`[trainos-migrations] complete (${applied}/${STMTS.length})`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
