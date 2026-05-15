-- CUI/FCI controlled intake registry (metadata-only in Codex)
-- Plaintext CUI remains in Azure Gov intake storage and the CUI Vault.

DO $$ BEGIN
 CREATE TYPE "public"."intake_expected_classification" AS ENUM(
  'CUI',
  'FCI',
  'EXPORT_CONTROLLED',
  'UNKNOWN',
  'NOT_CONTROLLED'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
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
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."intake_access_method" AS ENUM('ENTRA_B2B', 'USER_DELEGATION_SAS');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."intake_malware_scan_status" AS ENUM('pending', 'clean', 'failed', 'quarantined', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."intake_vault_import_status" AS ENUM('not_started', 'ready', 'imported', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."intake_disposition" AS ENUM('retained', 'deleted', 'quarantined', 'archived', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "intake_requests" (
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
);

CREATE TABLE IF NOT EXISTS "intake_access_grants" (
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
);

CREATE TABLE IF NOT EXISTS "intake_files" (
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
);

CREATE TABLE IF NOT EXISTS "intake_review_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intake_request_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "action_notes" text,
  "performed_by_identity" text,
  "performed_by_user_id" uuid,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "intake_evidence_artifacts" (
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
);

CREATE TABLE IF NOT EXISTS "intake_manifests" (
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
);

CREATE TABLE IF NOT EXISTS "intake_exceptions" (
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
);

CREATE TABLE IF NOT EXISTS "intake_control_mappings" (
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
);

ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_org_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_client_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_project_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_contract_fk"
  FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_requested_by_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_requests" ADD CONSTRAINT "intake_requests_reviewer_fk"
  FOREIGN KEY ("assigned_reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "intake_access_grants" ADD CONSTRAINT "intake_access_grants_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "intake_files" ADD CONSTRAINT "intake_files_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "intake_review_actions" ADD CONSTRAINT "intake_review_actions_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_review_actions" ADD CONSTRAINT "intake_review_actions_user_fk"
  FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_user_fk"
  FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_reviewer_action_fk"
  FOREIGN KEY ("reviewer_action_id") REFERENCES "public"."intake_review_actions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_evidence_artifacts" ADD CONSTRAINT "intake_evidence_artifacts_exception_fk"
  FOREIGN KEY ("exception_id") REFERENCES "public"."intake_exceptions"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "intake_manifests" ADD CONSTRAINT "intake_manifests_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_manifests" ADD CONSTRAINT "intake_manifests_signed_by_fk"
  FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_opened_by_fk"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_resolved_by_fk"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "intake_exceptions" ADD CONSTRAINT "intake_exceptions_reviewer_approved_by_fk"
  FOREIGN KEY ("reviewer_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "intake_control_mappings" ADD CONSTRAINT "intake_control_mappings_request_fk"
  FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "intake_control_mappings" ADD CONSTRAINT "intake_control_mappings_artifact_fk"
  FOREIGN KEY ("evidence_artifact_id") REFERENCES "public"."intake_evidence_artifacts"("id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "intake_requests_txn_unique_idx" ON "intake_requests" USING btree ("organization_id", "intake_transaction_id");
CREATE INDEX IF NOT EXISTS "intake_requests_org_status_idx" ON "intake_requests" USING btree ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "intake_requests_org_project_idx" ON "intake_requests" USING btree ("organization_id", "project_id");
CREATE INDEX IF NOT EXISTS "intake_access_grants_request_idx" ON "intake_access_grants" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_access_grants_expiry_idx" ON "intake_access_grants" USING btree ("access_expires_at");
CREATE INDEX IF NOT EXISTS "intake_files_request_idx" ON "intake_files" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_files_hash_idx" ON "intake_files" USING btree ("sha256_hash");
CREATE INDEX IF NOT EXISTS "intake_review_actions_request_idx" ON "intake_review_actions" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_evidence_artifacts_request_idx" ON "intake_evidence_artifacts" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_manifests_request_idx" ON "intake_manifests" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_manifests_hash_idx" ON "intake_manifests" USING btree ("manifest_hash");
CREATE INDEX IF NOT EXISTS "intake_exceptions_request_idx" ON "intake_exceptions" USING btree ("intake_request_id");
CREATE INDEX IF NOT EXISTS "intake_control_mappings_request_idx" ON "intake_control_mappings" USING btree ("intake_request_id");
