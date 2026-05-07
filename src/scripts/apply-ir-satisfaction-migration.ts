/**
 * Apply migration 0065 (IR tabletop satisfaction hardening) — same
 * hand-written-SQL pattern as the other apply-*-migration scripts in
 * this codebase, since the drizzle journal has been corrupt since a
 * prior sprint.
 *
 * Statements mirror drizzle/0065_ir_tabletop_satisfaction.sql verbatim.
 * Keep in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-ir-satisfaction-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  // ── ir_exercise_bundles new columns ─────────────────────────────────────────
  { label: "0065 ir_exercise_bundles.bundle_sha256", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "bundle_sha256" varchar(64)` },
  { label: "0065 ir_exercise_bundles.vault_storage_uri", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "vault_storage_uri" text` },
  { label: "0065 ir_exercise_bundles.vault_storage_region", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "vault_storage_region" text` },
  { label: "0065 ir_exercise_bundles.executed_at", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "executed_at" timestamptz` },
  { label: "0065 ir_exercise_bundles.valid_through_at", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "valid_through_at" timestamptz` },
  { label: "0065 ir_exercise_bundles.attestation_basis_json", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "attestation_basis_json" jsonb` },
  { label: "0065 ir_exercise_bundles.attendance_corroboration_kind", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "attendance_corroboration_kind" text` },
  { label: "0065 ir_exercise_bundles.attendance_corroboration_file_sha256", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "attendance_corroboration_file_sha256" varchar(64)` },
  { label: "0065 ir_exercise_bundles.attendance_seal_at", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "attendance_seal_at" timestamptz` },
  { label: "0065 ir_exercise_bundles.bundle_state", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "bundle_state" text NOT NULL DEFAULT 'provisional'` },
  { label: "0065 ir_exercise_bundles.anchor_hash", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "anchor_hash" varchar(64)` },
  { label: "0065 ir_exercise_bundles.prev_anchor_hash", sql: `ALTER TABLE "ir_exercise_bundles" ADD COLUMN IF NOT EXISTS "prev_anchor_hash" varchar(64)` },
  { label: "0065 ir_exercise_bundles_anchor_chain_idx", sql: `CREATE INDEX IF NOT EXISTS "ir_exercise_bundles_anchor_chain_idx" ON "ir_exercise_bundles" ("evidence_run_id", "created_at" DESC)` },
  // ── governance_artifact_completions per-objective ──────────────────────────
  { label: "0065 governance_artifact_completions.objective_id", sql: `ALTER TABLE "governance_artifact_completions" ADD COLUMN IF NOT EXISTS "objective_id" varchar(8)` },
  // ── ir_participant_disputes ────────────────────────────────────────────────
  {
    label: "0065 ir_participant_disputes table",
    sql: `CREATE TABLE IF NOT EXISTS "ir_participant_disputes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bundle_id" uuid NOT NULL REFERENCES "ir_exercise_bundles"("id") ON DELETE CASCADE,
      "participant_id" uuid REFERENCES "ir_exercise_participants"("id"),
      "participant_email" text NOT NULL,
      "participant_name" text NOT NULL,
      "dispute_token" text NOT NULL UNIQUE,
      "dispute_token_expires_at" timestamptz NOT NULL,
      "state" text NOT NULL DEFAULT 'pending'
        CHECK ("state" IN ('pending', 'confirmed', 'disputed', 'expired')),
      "responded_at" timestamptz,
      "dispute_reason" text,
      "notification_sent_at" timestamptz,
      "notification_email_id" text,
      "ip_address" text,
      "user_agent" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`,
  },
  { label: "0065 ir_participant_disputes_bundle_idx", sql: `CREATE INDEX IF NOT EXISTS "ir_participant_disputes_bundle_idx" ON "ir_participant_disputes" ("bundle_id")` },
  { label: "0065 ir_participant_disputes_token_idx", sql: `CREATE INDEX IF NOT EXISTS "ir_participant_disputes_token_idx" ON "ir_participant_disputes" ("dispute_token")` },
  { label: "0065 ir_participant_disputes_state_idx", sql: `CREATE INDEX IF NOT EXISTS "ir_participant_disputes_state_idx" ON "ir_participant_disputes" ("state", "dispute_token_expires_at")` },
];

async function run() {
  let applied = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      applied++;
      console.log(`[ir-satisfaction-migration] applied: ${stmt.label}`);
    } catch (err) {
      console.error(
        `[ir-satisfaction-migration] FAILED: ${stmt.label}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
  console.log(`[ir-satisfaction-migration] complete (${applied}/${STMTS.length})`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
