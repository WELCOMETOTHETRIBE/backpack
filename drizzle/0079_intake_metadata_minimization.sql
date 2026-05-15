-- Metadata minimization hardening for intake file references.
-- Goal: prevent raw filename/path persistence in Codex where possible.

ALTER TABLE "intake_files"
  ADD COLUMN IF NOT EXISTS "original_filename_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "sensitive_filename_retained" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "blob_path_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "vault_destination_path_hash" varchar(64);

ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_original_filename_hash_chk"
    CHECK ("original_filename_hash" IS NULL OR "original_filename_hash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_blob_path_hash_chk"
    CHECK ("blob_path_hash" IS NULL OR "blob_path_hash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_vault_path_hash_chk"
    CHECK ("vault_destination_path_hash" IS NULL OR "vault_destination_path_hash" ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS "intake_files_original_filename_hash_idx"
  ON "intake_files" USING btree ("original_filename_hash");
CREATE INDEX IF NOT EXISTS "intake_files_blob_path_hash_idx"
  ON "intake_files" USING btree ("blob_path_hash");
CREATE INDEX IF NOT EXISTS "intake_files_vault_path_hash_idx"
  ON "intake_files" USING btree ("vault_destination_path_hash");

-- digest()/encode() require pgcrypto (often absent on fresh Postgres until enabled).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill existing rows with hash/tokenized aliases so historical rows
-- are aligned to metadata-only posture.
UPDATE "intake_files"
SET
  "original_filename_hash" = COALESCE(
    "original_filename_hash",
    CASE
      WHEN "original_filename" IS NOT NULL
      THEN encode(digest("original_filename", 'sha256'), 'hex')
      ELSE NULL
    END
  ),
  "blob_path_hash" = COALESCE(
    "blob_path_hash",
    CASE
      WHEN "blob_path" IS NOT NULL
      THEN encode(digest("blob_path", 'sha256'), 'hex')
      ELSE NULL
    END
  ),
  "vault_destination_path_hash" = COALESCE(
    "vault_destination_path_hash",
    CASE
      WHEN "vault_destination_path" IS NOT NULL
      THEN encode(digest("vault_destination_path", 'sha256'), 'hex')
      ELSE NULL
    END
  ),
  "original_filename" = CASE
    WHEN "original_filename" IS NOT NULL
    THEN CONCAT('INTAKEOBJ-', substring(encode(digest("original_filename", 'sha256'), 'hex') for 12))
    ELSE "original_filename"
  END,
  "blob_path" = CASE
    WHEN "blob_path" IS NOT NULL
    THEN CONCAT('redacted://blob/', substring(encode(digest("blob_path", 'sha256'), 'hex') for 16))
    ELSE "blob_path"
  END,
  "vault_destination_path" = CASE
    WHEN "vault_destination_path" IS NOT NULL
    THEN CONCAT('redacted://vault/', substring(encode(digest("vault_destination_path", 'sha256'), 'hex') for 16))
    ELSE "vault_destination_path"
  END
WHERE
  "original_filename_hash" IS NULL
  OR "blob_path_hash" IS NULL
  OR "vault_destination_path_hash" IS NULL
  OR "original_filename" !~ '^INTAKEOBJ-';
