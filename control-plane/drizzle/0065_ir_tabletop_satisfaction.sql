-- IR Tabletop satisfaction hardening (3.6.1 / 3.6.2 / 3.6.3 wholehearted gate).
--
-- Adds the columns and table required by the C3PAO-defensible bundle
-- contract negotiated with TrainOS:
--
--   • bundle_sha256       — sha256 of the ZIP bytes (separate from manifest)
--   • vault_storage_uri   — Azure Gov blob URL (CUI bytes never on Codex)
--   • executed_at /
--     valid_through_at    — annual cadence enforcement (3.6.3)
--   • attestation_basis   — facilitator-attested-per-participant evidence
--   • attendance_corroboration_kind / _file_sha256 — Teams CSV or signed roster
--   • attendance_seal_at  — provisional → sealed (7-day dispute window)
--   • bundle_state        — provisional | sealed | rejected
--   • anchor_hash /
--     prev_anchor_hash    — tamper-evident chain across all bundles for an org
--   • objective_id on governance_artifact_completions — per-objective fidelity
--   • ir_participant_disputes table — per-participant dispute window
--
-- Idempotent. Safe to re-run via apply-ir-satisfaction-migration.ts.

-- ─── ir_exercise_bundles new columns ──────────────────────────────────────────
ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "bundle_sha256" varchar(64);

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "vault_storage_uri" text;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "vault_storage_region" text;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "executed_at" timestamptz;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "valid_through_at" timestamptz;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "attestation_basis_json" jsonb;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "attendance_corroboration_kind" text;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "attendance_corroboration_file_sha256" varchar(64);

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "attendance_seal_at" timestamptz;

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "bundle_state" text NOT NULL DEFAULT 'provisional';

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "anchor_hash" varchar(64);

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "prev_anchor_hash" varchar(64);

-- Quick lookup of the latest sealed bundle per org (for chain-tip resolution
-- on each new archive). Matches the join shape used by the bridge route.
CREATE INDEX IF NOT EXISTS "ir_exercise_bundles_anchor_chain_idx"
  ON "ir_exercise_bundles" ("evidence_run_id", "created_at" DESC);

-- ─── governance_artifact_completions per-objective fidelity ──────────────────
-- Lets a single bundle archive close 3.6.3[a] separately from 3.6.3[b]/[c]
-- instead of "the whole control was touched". Backfill semantics: NULL means
-- whole-control attestation (legacy rows + non-IR completions).
ALTER TABLE "governance_artifact_completions"
  ADD COLUMN IF NOT EXISTS "objective_id" varchar(8);

-- ─── ir_participant_disputes table ────────────────────────────────────────────
-- One row per named participant per bundle. Created at archive time, updated
-- if the participant clicks the magic link in the dispute notification email.
CREATE TABLE IF NOT EXISTS "ir_participant_disputes" (
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
);

CREATE INDEX IF NOT EXISTS "ir_participant_disputes_bundle_idx"
  ON "ir_participant_disputes" ("bundle_id");

CREATE INDEX IF NOT EXISTS "ir_participant_disputes_token_idx"
  ON "ir_participant_disputes" ("dispute_token");

CREATE INDEX IF NOT EXISTS "ir_participant_disputes_state_idx"
  ON "ir_participant_disputes" ("state", "dispute_token_expires_at");
