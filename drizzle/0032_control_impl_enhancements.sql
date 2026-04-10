-- P1: Add validation_method to control_records
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "validation_method" text;

-- P2: Create control_evidence_links — enclave evidence metadata (RunId + path + SHA-256)
-- Enforces metadata-only model: no file data is stored here.
CREATE TABLE IF NOT EXISTS "control_evidence_links" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"   uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "control_record_id" uuid NOT NULL REFERENCES "control_records"("id") ON DELETE CASCADE,
  "run_id"            text NOT NULL,
  "file_path"         text NOT NULL,
  "sha256_hash"       text NOT NULL,
  "description"       text,
  "source"            text,
  "linked_at"         timestamptz NOT NULL DEFAULT now(),
  "expires_at"        timestamptz,
  "linked_by"         uuid REFERENCES "users"("id")
);

CREATE INDEX IF NOT EXISTS "cel_org_control_idx"
  ON "control_evidence_links" ("organization_id", "control_record_id");
