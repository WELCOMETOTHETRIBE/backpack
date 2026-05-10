/**
 * Apply 0075 ssp_release_baselines migration.
 *
 * Same workaround as the other apply-* scripts in this directory: the
 * drizzle journal in this codebase has been corrupt since a prior
 * sprint, so `drizzle-kit migrate` no-ops on hand-written SQL files.
 * Re-emit 0075's statements as idempotent CREATE / ALTER calls and
 * run on every deploy via `npm run release`.
 *
 * Statements mirror drizzle/0075_ssp_release_baselines.sql verbatim.
 * Keep them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-ssp-release-baselines-migration.ts
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
    label: "0075 ssp_release_baselines table",
    sql: `CREATE TABLE IF NOT EXISTS ssp_release_baselines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      ssp_doc_control_submission_id uuid NOT NULL
        REFERENCES ssp_doc_control_submissions(id) ON DELETE RESTRICT,
      ssp_document_id uuid NOT NULL
        REFERENCES ssp_documents(id) ON DELETE RESTRICT,
      ssp_version_number integer NOT NULL,
      boundary_id uuid NOT NULL
        REFERENCES boundaries(id) ON DELETE RESTRICT,
      status varchar(16) NOT NULL DEFAULT 'active',
      payload_sha256 varchar(64) NOT NULL,
      qms_document_number text NOT NULL,
      qms_sha256 varchar(64) NOT NULL,
      signoffs_json jsonb NOT NULL,
      qms_manifest_run_id text,
      released_at timestamptz NOT NULL,
      finalized_at timestamptz NOT NULL DEFAULT now(),
      superseded_at timestamptz,
      superseded_by_id uuid REFERENCES ssp_release_baselines(id) ON DELETE SET NULL,
      release_notes text,
      app_version text,
      git_commit_sha text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ssp_release_baselines_status_chk
        CHECK (status IN ('active', 'superseded', 'retired'))
    )`,
  },
  {
    label: "0075 ssp_release_baselines one-per-submission idempotency anchor",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS ssp_release_baselines_one_per_submission_idx
      ON ssp_release_baselines (ssp_doc_control_submission_id)`,
  },
  {
    label: "0075 ssp_release_baselines org+status index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_release_baselines_org_status_idx
      ON ssp_release_baselines (organization_id, status)`,
  },
  {
    label: "0075 ssp_release_baselines doc index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_release_baselines_doc_idx
      ON ssp_release_baselines (ssp_document_id)`,
  },
  {
    label: "0075 ssp_release_baselines active-per-boundary index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_release_baselines_active_per_boundary_idx
      ON ssp_release_baselines (organization_id, boundary_id, status)`,
  },
];

(async () => {
  for (const { label, sql: stmt } of STMTS) {
    try {
      await sql.unsafe(stmt);
      console.log(`  ok  ${label}`);
    } catch (err) {
      console.error(`  FAIL ${label}:`, err);
      process.exit(1);
    }
  }
  await sql.end();
  console.log("apply-ssp-release-baselines-migration: 0075 applied (idempotent).");
})();
