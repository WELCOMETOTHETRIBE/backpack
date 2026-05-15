/**
 * Apply intake registry migrations (0078–0080).
 *
 * Same workaround as apply-adjudication-migrations.ts: drizzle-kit migrate only
 * follows drizzle/meta/_journal.json (stuck at 0052), so handwritten SQL under
 * drizzle/ never reaches Railway unless we replay it here.
 *
 * Statements mirror drizzle/0078_cui_intake_registry.sql,
 * drizzle/0079_intake_metadata_minimization.sql, and
 * drizzle/0080_intake_metadata_events.sql. Keep them in sync.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-intake-registry-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

/** FK / constraint adds — safe on repeat */
function fk(sqlBody: string): string {
  return `DO $$ BEGIN
  ${sqlBody.trim().replace(/;$/, "")};
EXCEPTION WHEN duplicate_object THEN null;
END $$`;
}

const STMTS: { label: string; sql: string }[] = [
  // ── 0078: enums ───────────────────────────────────────────────────────────
  {
    label: "0078 enum intake_expected_classification",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_expected_classification" AS ENUM(
  'CUI',
  'FCI',
  'EXPORT_CONTROLLED',
  'UNKNOWN',
  'NOT_CONTROLLED'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0078 enum intake_status",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_status" AS ENUM(
  'Draft',
  'Pending Authorization',
  'Upload Scope Provisioned',
  'Awaiting Upload',
  'Uploaded',
  'Scan Pending',
  'Scan Clean',
  'Scan Failed',
  'Quarantined',
  'Hash Generated',
  'Ready for Vault Import',
  'Imported to Vault',
  'Reviewer Approved',
  'Access Revoked',
  'Evidence Package Generated',
  'Closed',
  'Exception',
  'Rejected'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0078 enum intake_access_method",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_access_method" AS ENUM('ENTRA_B2B', 'USER_DELEGATION_SAS');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0078 enum intake_malware_scan_status",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_malware_scan_status" AS ENUM('pending', 'clean', 'failed', 'quarantined', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0078 enum intake_vault_import_status",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_vault_import_status" AS ENUM('not_started', 'ready', 'imported', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0078 enum intake_disposition",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_disposition" AS ENUM('retained', 'deleted', 'quarantined', 'archived', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },

  // ── 0078: tables ─────────────────────────────────────────────────────────
  {
    label: "0078 table intake_requests",
    sql: `CREATE TABLE IF NOT EXISTS "intake_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_transaction_id" varchar(100) NOT NULL,
  "organization_id" uuid NOT NULL,
  "client_id" uuid,
  "project_id" uuid,
  "contract_id" uuid,
  "opportunity_id" text,
  "title" text NOT NULL,
  "description" text,
  "expected_classification" "intake_expected_classification" DEFAULT 'UNKNOWN' NOT NULL,
  "cui_category" text,
  "fci_flag" boolean DEFAULT false NOT NULL,
  "export_control_flag" boolean DEFAULT false NOT NULL,
  "authorization_basis" text NOT NULL,
  "requested_by_user_id" uuid,
  "assigned_reviewer_user_id" uuid,
  "sender_name" text,
  "sender_email" text,
  "sender_organization" text,
  "sender_domain" text,
  "identity_verification_method" text,
  "entra_guest_object_id" text,
  "upload_method" "intake_access_method",
  "status" "intake_status" DEFAULT 'Draft' NOT NULL,
  "manifest_hash" varchar(64),
  "manifest_generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  CONSTRAINT "intake_requests_hash_length_chk" CHECK (
    manifest_hash IS NULL OR manifest_hash ~ '^[a-f0-9]{64}$'
  )
)`,
  },
  {
    label: "0078 table intake_access_grants",
    sql: `CREATE TABLE IF NOT EXISTS "intake_access_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "access_method" "intake_access_method" NOT NULL,
  "access_scope" text NOT NULL,
  "authorization_basis" text,
  "access_granted_at" timestamp with time zone,
  "access_expires_at" timestamp with time zone,
  "access_revoked_at" timestamp with time zone,
  "token_reference_hash" varchar(64),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_access_grants_hash_length_chk" CHECK (
    token_reference_hash IS NULL OR token_reference_hash ~ '^[a-f0-9]{64}$'
  )
)`,
  },
  {
    label: "0078 table intake_files",
    sql: `CREATE TABLE IF NOT EXISTS "intake_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "original_filename" text NOT NULL,
  "storage_account" text,
  "container_name" text,
  "blob_path" text,
  "blob_url_redacted" text,
  "content_type" text,
  "file_size" integer,
  "upload_timestamp" timestamp with time zone,
  "uploaded_by_identity" text,
  "malware_scan_status" "intake_malware_scan_status" DEFAULT 'unknown' NOT NULL,
  "malware_scan_timestamp" timestamp with time zone,
  "malware_scan_result_reference" text,
  "sha256_hash" varchar(64),
  "hash_generated_by" text,
  "hash_generated_at" timestamp with time zone,
  "vault_import_status" "intake_vault_import_status" DEFAULT 'not_started' NOT NULL,
  "vault_destination_path" text,
  "vault_import_timestamp" timestamp with time zone,
  "imported_by_identity" text,
  "classification_status" text,
  "disposition" "intake_disposition",
  "disposition_timestamp" timestamp with time zone,
  "exception_flag" boolean DEFAULT false NOT NULL,
  "exception_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_files_hash_length_chk" CHECK (
    sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'
  )
)`,
  },
  {
    label: "0078 table intake_review_actions",
    sql: `CREATE TABLE IF NOT EXISTS "intake_review_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "action_notes" text,
  "performed_by_identity" text,
  "performed_by_user_id" uuid,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  },
  {
    label: "0078 table intake_evidence_artifacts",
    sql: `CREATE TABLE IF NOT EXISTS "intake_evidence_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "artifact_type" text NOT NULL,
  "artifact_name" text NOT NULL,
  "artifact_path" text,
  "artifact_hash" varchar(64),
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" uuid,
  "boundary_location" text,
  "source_of_truth" text,
  "immutable_flag" boolean DEFAULT false NOT NULL,
  "retention_requirement" text,
  "related_control_family" text,
  "related_control_id" text,
  "status" text DEFAULT 'generated' NOT NULL,
  "reviewer_action_id" uuid,
  "exception_id" uuid,
  "poam_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_evidence_artifacts_hash_length_chk" CHECK (
    artifact_hash IS NULL OR artifact_hash ~ '^[a-f0-9]{64}$'
  )
)`,
  },
  {
    label: "0078 table intake_manifests",
    sql: `CREATE TABLE IF NOT EXISTS "intake_manifests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "manifest_json" text NOT NULL,
  "manifest_hash" varchar(64) NOT NULL,
  "signed_by" uuid,
  "signed_at" timestamp with time zone,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "storage_location" text,
  "source_of_truth" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_manifests_hash_length_chk" CHECK (
    manifest_hash ~ '^[a-f0-9]{64}$'
  )
)`,
  },
  {
    label: "0078 table intake_exceptions",
    sql: `CREATE TABLE IF NOT EXISTS "intake_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "exception_type" text NOT NULL,
  "reason" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "affected_control_family" text,
  "affected_control_id" text,
  "compensating_action" text,
  "owner" text,
  "due_date" date,
  "status" text DEFAULT 'open' NOT NULL,
  "poam_reference" text,
  "opened_by_user_id" uuid,
  "resolved_by_user_id" uuid,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "closure_notes" text,
  "reviewer_approved_by_user_id" uuid,
  "reviewer_approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  },
  {
    label: "0078 table intake_control_mappings",
    sql: `CREATE TABLE IF NOT EXISTS "intake_control_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "control_family" text NOT NULL,
  "control_id" text,
  "control_intent" text,
  "evidence_artifact_id" uuid,
  "owner" text,
  "cadence" text,
  "source_of_truth" text,
  "implementation_nature" text,
  "implementation_risk" text,
  "c3pao_prompt" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  },

  // ── 0078: FKs ─────────────────────────────────────────────────────────────
  {
    label: "0078 FK intake_requests_org_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_org_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_requests_client_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_client_fk"
      FOREIGN KEY ("client_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_requests_project_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_project_fk"
      FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_requests_contract_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_contract_fk"
      FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_requests_requested_by_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_requested_by_fk"
      FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_requests_reviewer_fk",
    sql: fk(`ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_reviewer_fk"
      FOREIGN KEY ("assigned_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_access_grants_request_fk",
    sql: fk(`ALTER TABLE "intake_access_grants" ADD CONSTRAINT "intake_access_grants_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_files_request_fk",
    sql: fk(`ALTER TABLE "intake_files" ADD CONSTRAINT "intake_files_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_review_actions_request_fk",
    sql: fk(`ALTER TABLE "intake_review_actions" ADD CONSTRAINT "intake_review_actions_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_review_actions_user_fk",
    sql: fk(`ALTER TABLE "intake_review_actions" ADD CONSTRAINT "intake_review_actions_user_fk"
      FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_evidence_artifacts_request_fk",
    sql: fk(`ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_evidence_artifacts_user_fk",
    sql: fk(`ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_user_fk"
      FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_evidence_artifacts_reviewer_action_fk",
    sql: fk(`ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_reviewer_action_fk"
      FOREIGN KEY ("reviewer_action_id") REFERENCES "public"."intake_review_actions"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_evidence_artifacts_exception_fk",
    sql: fk(`ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_exception_fk"
      FOREIGN KEY ("exception_id") REFERENCES "public"."intake_exceptions"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_manifests_request_fk",
    sql: fk(`ALTER TABLE "intake_manifests" ADD CONSTRAINT "intake_manifests_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_manifests_signed_by_fk",
    sql: fk(`ALTER TABLE "intake_manifests" ADD CONSTRAINT "intake_manifests_signed_by_fk"
      FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_exceptions_request_fk",
    sql: fk(`ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_exceptions_opened_by_fk",
    sql: fk(`ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_opened_by_fk"
      FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_exceptions_resolved_by_fk",
    sql: fk(`ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_resolved_by_fk"
      FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_exceptions_reviewer_approved_by_fk",
    sql: fk(`ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_reviewer_approved_by_fk"
      FOREIGN KEY ("reviewer_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_control_mappings_request_fk",
    sql: fk(`ALTER TABLE "intake_control_mappings" ADD CONSTRAINT "intake_control_mappings_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0078 FK intake_control_mappings_artifact_fk",
    sql: fk(`ALTER TABLE "intake_control_mappings" ADD CONSTRAINT "intake_control_mappings_artifact_fk"
      FOREIGN KEY ("evidence_artifact_id") REFERENCES "public"."intake_evidence_artifacts"("id") ON DELETE set null ON UPDATE no action`),
  },

  // ── 0078: indexes ─────────────────────────────────────────────────────────
  {
    label: "0078 idx intake_requests_txn_unique_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "intake_requests_txn_unique_idx" ON "intake_requests" USING btree ("organization_id", "intake_transaction_id")`,
  },
  {
    label: "0078 idx intake_requests_org_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_requests_org_status_idx" ON "intake_requests" USING btree ("organization_id", "status")`,
  },
  {
    label: "0078 idx intake_requests_org_project_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_requests_org_project_idx" ON "intake_requests" USING btree ("organization_id", "project_id")`,
  },
  {
    label: "0078 idx intake_access_grants_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_access_grants_request_idx" ON "intake_access_grants" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_access_grants_expiry_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_access_grants_expiry_idx" ON "intake_access_grants" USING btree ("access_expires_at")`,
  },
  {
    label: "0078 idx intake_files_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_files_request_idx" ON "intake_files" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_files_hash_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_files_hash_idx" ON "intake_files" USING btree ("sha256_hash")`,
  },
  {
    label: "0078 idx intake_review_actions_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_review_actions_request_idx" ON "intake_review_actions" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_evidence_artifacts_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_evidence_artifacts_request_idx" ON "intake_evidence_artifacts" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_manifests_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_manifests_request_idx" ON "intake_manifests" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_manifests_hash_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_manifests_hash_idx" ON "intake_manifests" USING btree ("manifest_hash")`,
  },
  {
    label: "0078 idx intake_exceptions_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_exceptions_request_idx" ON "intake_exceptions" USING btree ("intake_request_id")`,
  },
  {
    label: "0078 idx intake_control_mappings_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_control_mappings_request_idx" ON "intake_control_mappings" USING btree ("intake_request_id")`,
  },

  // ── 0079: minimization columns + checks ───────────────────────────────────
  {
    label: "0079 intake_files minimization columns",
    sql: `ALTER TABLE "intake_files"
  ADD COLUMN IF NOT EXISTS "original_filename_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "sensitive_filename_retained" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "blob_path_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "vault_destination_path_hash" varchar(64)`,
  },
  {
    label: "0079 intake_files_original_filename_hash_chk",
    sql: fk(`ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_original_filename_hash_chk"
    CHECK ("original_filename_hash" IS NULL OR "original_filename_hash" ~ '^[a-f0-9]{64}$')`),
  },
  {
    label: "0079 intake_files_blob_path_hash_chk",
    sql: fk(`ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_blob_path_hash_chk"
    CHECK ("blob_path_hash" IS NULL OR "blob_path_hash" ~ '^[a-f0-9]{64}$')`),
  },
  {
    label: "0079 intake_files_vault_path_hash_chk",
    sql: fk(`ALTER TABLE "intake_files"
  ADD CONSTRAINT "intake_files_vault_path_hash_chk"
    CHECK ("vault_destination_path_hash" IS NULL OR "vault_destination_path_hash" ~ '^[a-f0-9]{64}$')`),
  },
  {
    label: "0079 intake_files_original_filename_hash_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_files_original_filename_hash_idx"
  ON "intake_files" USING btree ("original_filename_hash")`,
  },
  {
    label: "0079 intake_files_blob_path_hash_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_files_blob_path_hash_idx"
  ON "intake_files" USING btree ("blob_path_hash")`,
  },
  {
    label: "0079 intake_files_vault_path_hash_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_files_vault_path_hash_idx"
  ON "intake_files" USING btree ("vault_destination_path_hash")`,
  },
  {
    label: "0079 extension pgcrypto (digest/encode)",
    sql: `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  },
  {
    label: "0079 backfill hashed filenames/paths",
    sql: `UPDATE "intake_files"
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
  OR "original_filename" !~ '^INTAKEOBJ-'`,
  },

  // ── 0080: metadata events ─────────────────────────────────────────────────
  {
    label: "0080 enum intake_metadata_event_type",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_metadata_event_type" AS ENUM(
  'intake_upload_authorization',
  'intake_upload_started',
  'intake_upload_completed',
  'intake_rejected',
  'intake_expired',
  'intake_replay_blocked'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0080 enum intake_metadata_event_status",
    sql: `DO $$ BEGIN
 CREATE TYPE "public"."intake_metadata_event_status" AS ENUM(
  'issued',
  'preflight_recorded',
  'upload_started',
  'upload_completed',
  'rejected',
  'expired',
  'replay_blocked'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$`,
  },
  {
    label: "0080 table intake_metadata_events",
    sql: `CREATE TABLE IF NOT EXISTS "intake_metadata_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "transaction_id" varchar(100) NOT NULL,
  "event_type" "intake_metadata_event_type" NOT NULL,
  "status" "intake_metadata_event_status" NOT NULL,
  "event_timestamp_utc" timestamp with time zone DEFAULT now() NOT NULL,
  "timestamp_bucket" varchar(32) NOT NULL,
  "object_reference_token" text,
  "issued_by_actor_id" text,
  "recipient_email_hash" varchar(64),
  "artifact_type" text,
  "token_id" text,
  "token_expires_at_utc" timestamp with time zone,
  "boundary_assertion" text DEFAULT 'metadata_only' NOT NULL,
  "upload_destination" text DEFAULT 'azure_blob_direct' NOT NULL,
  "planned_bundle_hash_sha256" varchar(64),
  "content_hash_sha256" varchar(64),
  "size_bytes" integer,
  "upload_completed_at_utc" timestamp with time zone,
  "malware_scan_status" text,
  "policy_version" text NOT NULL,
  "evidence_trace_id" text,
  "correlation_id" text,
  "source_system" text DEFAULT 'enclavewatch' NOT NULL,
  "replay_key" text,
  "decision" text DEFAULT 'accepted' NOT NULL,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_metadata_events_recipient_hash_chk" CHECK (
    recipient_email_hash IS NULL OR recipient_email_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_planned_hash_chk" CHECK (
    planned_bundle_hash_sha256 IS NULL OR planned_bundle_hash_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_content_hash_chk" CHECK (
    content_hash_sha256 IS NULL OR content_hash_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "intake_metadata_events_size_chk" CHECK (
    size_bytes IS NULL OR size_bytes >= 0
  ),
  CONSTRAINT "intake_metadata_events_boundary_assertion_chk" CHECK (
    boundary_assertion = 'metadata_only'
  ),
  CONSTRAINT "intake_metadata_events_upload_destination_chk" CHECK (
    upload_destination = 'azure_blob_direct'
  ),
  CONSTRAINT "intake_metadata_events_source_system_chk" CHECK (
    source_system = 'enclavewatch'
  ),
  CONSTRAINT "intake_metadata_events_decision_chk" CHECK (
    decision IN ('accepted', 'rejected')
  )
)`,
  },
  {
    label: "0080 FK intake_metadata_events_org_fk",
    sql: fk(`ALTER TABLE "intake_metadata_events" ADD CONSTRAINT "intake_metadata_events_org_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0080 FK intake_metadata_events_request_fk",
    sql: fk(`ALTER TABLE "intake_metadata_events" ADD CONSTRAINT "intake_metadata_events_request_fk"
      FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action`),
  },
  {
    label: "0080 idx intake_metadata_events_event_unique_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "intake_metadata_events_event_unique_idx"
  ON "intake_metadata_events" USING btree ("organization_id", "event_id")`,
  },
  {
    label: "0080 idx intake_metadata_events_replay_unique_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "intake_metadata_events_replay_unique_idx"
  ON "intake_metadata_events" USING btree ("organization_id", "transaction_id", "event_type", "timestamp_bucket")`,
  },
  {
    label: "0080 idx intake_metadata_events_request_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_metadata_events_request_idx"
  ON "intake_metadata_events" USING btree ("intake_request_id")`,
  },
  {
    label: "0080 idx intake_metadata_events_tx_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_metadata_events_tx_idx"
  ON "intake_metadata_events" USING btree ("transaction_id")`,
  },
  {
    label: "0080 idx intake_metadata_events_corr_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_metadata_events_corr_idx"
  ON "intake_metadata_events" USING btree ("correlation_id")`,
  },
  {
    label: "0080 idx intake_metadata_events_event_ts_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_metadata_events_event_ts_idx"
  ON "intake_metadata_events" USING btree ("event_timestamp_utc")`,
  },
  {
    label: "0080 idx intake_metadata_events_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "intake_metadata_events_status_idx"
  ON "intake_metadata_events" USING btree ("status")`,
  },
];

async function main() {
  let appliedCount = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      console.log(`✓ ${stmt.label}`);
      appliedCount++;
    } catch (err) {
      console.error(`✗ ${stmt.label}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  console.log(`\nApplied ${appliedCount} statement(s).`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
