-- Ensure boundary engine tables exist (idempotent; some DBs never had a migration that created them)
CREATE TABLE IF NOT EXISTS "account_boundary" (
  "account_id" uuid NOT NULL PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "boundary_id" text NOT NULL,
  "provider_key" text NOT NULL,
  "environment_key" text NOT NULL,
  "hosting_model" text NOT NULL,
  "boundary_input_json" jsonb NOT NULL,
  "allocation_hash_current" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_boundary_provider_env_idx" ON "account_boundary" USING btree ("provider_key", "environment_key");

CREATE TABLE IF NOT EXISTS "boundary_snapshots" (
  "snapshot_id" text PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "account_boundary"("account_id") ON DELETE CASCADE,
  "boundary_id" text NOT NULL,
  "allocation_hash" text NOT NULL,
  "registry_version" text DEFAULT '' NOT NULL,
  "snapshot_metadata_json" jsonb NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "snapshot_signature" text,
  "evidence_run_fingerprints" jsonb
);
CREATE INDEX IF NOT EXISTS "boundary_snapshots_account_created_idx" ON "boundary_snapshots" USING btree ("account_id", "created_at");

-- Snapshot attestation: add columns if table already existed without them
ALTER TABLE "boundary_snapshots" ADD COLUMN IF NOT EXISTS "snapshot_signature" text;
ALTER TABLE "boundary_snapshots" ADD COLUMN IF NOT EXISTS "evidence_run_fingerprints" jsonb;
CREATE INDEX IF NOT EXISTS "boundary_snapshots_snapshot_signature_idx" ON "boundary_snapshots" USING btree ("snapshot_signature");
