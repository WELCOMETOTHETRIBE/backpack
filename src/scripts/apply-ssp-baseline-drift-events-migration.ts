/**
 * Apply 0076 ssp_baseline_drift_events migration.
 *
 * Same workaround as the other apply-* scripts in this directory.
 * Statements mirror drizzle/0076_ssp_baseline_drift_events.sql verbatim.
 * Keep them in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-ssp-baseline-drift-events-migration.ts
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
    label: "0076 ssp_baseline_drift_events table",
    sql: `CREATE TABLE IF NOT EXISTS ssp_baseline_drift_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      baseline_id uuid NOT NULL
        REFERENCES ssp_release_baselines(id) ON DELETE CASCADE,
      severity varchar(16) NOT NULL,
      drift_type varchar(64) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'open',
      source_table varchar(64),
      source_record_id text,
      control_id varchar(20),
      previous_hash varchar(64),
      current_hash varchar(64),
      previous_value_json jsonb,
      current_value_json jsonb,
      summary text NOT NULL,
      recommendation text,
      requires_ssp_redraft boolean NOT NULL DEFAULT false,
      requires_poam_review boolean NOT NULL DEFAULT false,
      requires_document_control_review boolean NOT NULL DEFAULT false,
      detected_at timestamptz NOT NULL DEFAULT now(),
      first_detected_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_at timestamptz,
      acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      adjudicated_at timestamptz,
      adjudicated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      adjudication_notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ssp_baseline_drift_events_severity_chk
        CHECK (severity IN ('minor', 'moderate', 'material')),
      CONSTRAINT ssp_baseline_drift_events_status_chk
        CHECK (status IN ('open', 'acknowledged', 'dismissed', 'resolved'))
    )`,
  },
  {
    label: "0076 ssp_baseline_drift_events dedup idempotency anchor",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS ssp_baseline_drift_events_dedup_idx
      ON ssp_baseline_drift_events (
        baseline_id,
        drift_type,
        COALESCE(source_record_id, ''),
        COALESCE(control_id, '')
      )
      WHERE status = 'open'`,
  },
  {
    label: "0076 ssp_baseline_drift_events org+status+severity index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_org_status_severity_idx
      ON ssp_baseline_drift_events (organization_id, status, severity)`,
  },
  {
    label: "0076 ssp_baseline_drift_events baseline index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_baseline_idx
      ON ssp_baseline_drift_events (baseline_id)`,
  },
  {
    label: "0076 ssp_baseline_drift_events control index",
    sql: `CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_control_idx
      ON ssp_baseline_drift_events (organization_id, control_id)
      WHERE control_id IS NOT NULL`,
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
  console.log("apply-ssp-baseline-drift-events-migration: 0076 applied (idempotent).");
})();
