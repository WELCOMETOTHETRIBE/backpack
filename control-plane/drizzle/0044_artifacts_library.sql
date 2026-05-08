-- Migration: centralized Artifacts library
--
-- 1. Adds lifecycle + catalog-expectation columns to `artifacts` and relaxes
--    file columns to nullable so placeholder rows (status = 'awaiting_upload')
--    can exist before a file is attached.
-- 2. Adds an `artifact_links` join table so one stored file can satisfy any
--    number of controls, governance register entries, POAM entries, and POAM
--    milestones simultaneously.
--
-- Backward-compatible: every existing `artifacts` row gets status = 'uploaded'
-- via the default clause; no data rewrite required.

CREATE TYPE "artifact_status" AS ENUM (
  'awaiting_upload',
  'uploaded',
  'approved',
  'superseded',
  'expired'
);

CREATE TYPE "artifact_link_type" AS ENUM (
  'control',
  'register_entry',
  'poam_entry',
  'poam_milestone'
);

-- --- artifacts: new columns + file-column relaxation --------------------------

ALTER TABLE "artifacts" ALTER COLUMN "file_name" DROP NOT NULL;
ALTER TABLE "artifacts" ALTER COLUMN "file_url"  DROP NOT NULL;

ALTER TABLE "artifacts"
  ADD COLUMN "status"                 "artifact_status" NOT NULL DEFAULT 'uploaded',
  ADD COLUMN "expected_closure_type"  VARCHAR(32),
  ADD COLUMN "expected_evidence_type" VARCHAR(32),
  ADD COLUMN "expected_cadence"       VARCHAR(32),
  ADD COLUMN "expected_due_date"      DATE,
  ADD COLUMN "milestone_key"          VARCHAR(120);

CREATE INDEX "artifacts_status_idx"        ON "artifacts"("status");
CREATE INDEX "artifacts_milestone_key_idx" ON "artifacts"("milestone_key");

-- --- artifact_links table ----------------------------------------------------

CREATE TABLE "artifact_links" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),
  "artifact_id"     UUID NOT NULL REFERENCES "artifacts"("id") ON DELETE CASCADE,
  "link_type"       "artifact_link_type" NOT NULL,
  "link_target_id"  UUID NOT NULL,
  "created_by"      UUID REFERENCES "users"("id"),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "artifact_links_unique"
  ON "artifact_links"("artifact_id", "link_type", "link_target_id");

CREATE INDEX "artifact_links_target_idx"
  ON "artifact_links"("link_type", "link_target_id");
