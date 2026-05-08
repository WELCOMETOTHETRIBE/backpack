-- Migration: 0041_trust_codex_onboarding_wizard.sql
-- Adds three tables for the Trust Codex Onboarding Wizard (v2):
--   1. trust_codex_acceptances  — legal gate record
--   2. onboarding_wizard_state  — resumable wizard progress
--   3. control_adjudications    — per-control legal adjudication record

-- ─── trust_codex_acceptances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "trust_codex_acceptances" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"       UUID NOT NULL REFERENCES "organizations"("id"),
  "version"               VARCHAR(20) NOT NULL DEFAULT '1.0',
  "accepted_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "accepted_by_user_id"   UUID NOT NULL,
  "signatory_name"        VARCHAR(255) NOT NULL,
  "signatory_title"       VARCHAR(255) NOT NULL,
  "cage_code"             VARCHAR(10),
  "prime_contract_number" VARCHAR(100),
  "ip_address"            VARCHAR(45),
  "user_agent_hash"       VARCHAR(64)
);

-- ─── onboarding_wizard_state ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "onboarding_wizard_state" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"     UUID NOT NULL UNIQUE REFERENCES "organizations"("id"),
  "current_phase"       INTEGER NOT NULL DEFAULT 0,
  "completed_phases"    JSONB DEFAULT '[]',
  "phase_data"          JSONB DEFAULT '{}',
  "sprs_score_snapshot" INTEGER,
  "completed_at"        TIMESTAMPTZ,
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── control_adjudications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "control_adjudications" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"       UUID NOT NULL REFERENCES "organizations"("id"),
  "control_id"            VARCHAR(20) NOT NULL,
  "tier"                  VARCHAR(30) NOT NULL,
  "status"                VARCHAR(30) NOT NULL,
  "narrative"             TEXT,
  "attested_by_user_id"   UUID,
  "attested_at"           TIMESTAMPTZ,
  "evidence_blob_keys"    JSONB DEFAULT '[]',
  "evidence_blob_hashes"  JSONB DEFAULT '{}',
  "poam_target_date"      DATE,
  "poam_notes"            TEXT,
  "needs_review"          BOOLEAN NOT NULL DEFAULT FALSE,
  "needs_review_reason"   TEXT,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_control_unique"
  ON "control_adjudications"("organization_id", "control_id");
