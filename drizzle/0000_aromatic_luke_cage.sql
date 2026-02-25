-- Reduce NOTICE volume to avoid Railway log rate limit (42P06/42P07 "already exists, skipping")
SET client_min_messages = 'warning';
-- Idempotent: create enums only if not present (avoids 42710 on redeploy when type already exists)
DO $$ BEGIN CREATE TYPE "public"."attestation_type" AS ENUM('control_attestation', 'evidence_review', 'poam_closure', 'document_approval'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."cmmc_level" AS ENUM('Level1', 'Level2', 'Level3'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."control_status" AS ENUM('Not Started', 'Implemented', 'Partial', 'POA&M', 'Inherited', 'Not Applicable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."document_type" AS ENUM('ssp', 'policy', 'asset', 'data_flow'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."evidence_type" AS ENUM('screenshot', 'config_file', 'scan_result', 'log_file'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."evidence_validation_status" AS ENUM('Valid', 'Expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."implementation_status" AS ENUM('not_started', 'in_progress', 'implemented', 'assessed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."monitoring_cadence" AS ENUM('Quarterly', 'Monthly', 'Annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."poam_entry_status" AS ENUM('open', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."poam_status" AS ENUM('Open', 'In Progress', 'Pending Closure', 'Closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."review_frequency" AS ENUM('Monthly', 'Quarterly', 'Semiannual', 'Annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."risk_severity" AS ENUM('Low', 'Medium', 'High', 'Critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."subcontractor_relationship_status" AS ENUM('Pending', 'Active', 'Suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."user_role" AS ENUM('Admin', 'Compliance', 'Assessor'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_record_id" uuid NOT NULL,
	"artifact_label" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"version" varchar(50),
	"approval_date" date,
	"uploaded_by" uuid,
	"vault_document_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"description" text,
	"location_reference" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attestation_type" "attestation_type" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"signatory_id" uuid NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_hash" text,
	"signature_crypto" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"details" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prime_organization_id" uuid NOT NULL,
	"sub_organization_id" uuid NOT NULL,
	"contract_name" text NOT NULL,
	"contract_number" text,
	"cmmc_level_required" "cmmc_level" NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "control_families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_implementation_id" uuid NOT NULL,
	"changed_by_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control_implementations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"status" "control_status" DEFAULT 'Not Started' NOT NULL,
	"implementation_narrative" text,
	"responsible_owner_id" uuid,
	"monitoring_cadence" "monitoring_cadence",
	"last_validation_date" timestamp with time zone,
	"policy_sop_refs" text,
	"last_reviewed_at" timestamp with time zone,
	"review_frequency" "review_frequency",
	"next_review_due" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_id" varchar(20) NOT NULL,
	"implementation_status" "implementation_status" DEFAULT 'not_started' NOT NULL,
	"governance_narrative" text,
	"technical_narrative" text,
	"responsible_role_id" uuid,
	"inherited_from" varchar(255),
	"assessor_id" uuid,
	"assessor_findings" text,
	"assessment_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_family_id" uuid NOT NULL,
	"control_id" text NOT NULL,
	"nist_req_id" text NOT NULL,
	"title" text NOT NULL,
	"nist_exact_text" text,
	"nist_discussion_guidance" text,
	"codex_metadata" jsonb,
	CONSTRAINT "controls_control_id_unique" UNIQUE("control_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"diagram_reference" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_control_links" (
	"evidence_metadata_id" uuid NOT NULL,
	"control_implementation_id" uuid NOT NULL,
	CONSTRAINT "evidence_control_links_evidence_metadata_id_control_implementation_id_pk" PRIMARY KEY("evidence_metadata_id","control_implementation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evidence_id" text NOT NULL,
	"run_id" text NOT NULL,
	"artifact_filename" text NOT NULL,
	"storage_location" text NOT NULL,
	"sha256_hash" text,
	"generated_date" timestamp with time zone NOT NULL,
	"generated_by_id" uuid,
	"validation_status" "evidence_validation_status" DEFAULT 'Valid',
	"retention_until" timestamp with time zone NOT NULL,
	"regeneration_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flowdown_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"is_required" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poam_closure_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poam_item_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"approval_order" integer NOT NULL,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poam_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_record_id" uuid NOT NULL,
	"status" "poam_entry_status" DEFAULT 'open' NOT NULL,
	"weakness_description" text,
	"remediation_plan" text,
	"scheduled_completion_date" date,
	"responsible_role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poam_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_implementation_id" uuid NOT NULL,
	"poam_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"root_cause" text,
	"risk_severity" "risk_severity" DEFAULT 'Medium',
	"status" "poam_status" DEFAULT 'Open' NOT NULL,
	"target_completion_date" timestamp with time zone NOT NULL,
	"responsible_party_id" uuid,
	"evidence_metadata_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poam_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poam_item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poam_risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poam_item_id" uuid NOT NULL,
	"assessed_by_id" uuid NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ssp_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_code" text NOT NULL,
	"section_key" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subcontractor_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prime_organization_id" uuid NOT NULL,
	"sub_organization_id" uuid,
	"status" "subcontractor_relationship_status" DEFAULT 'Pending' NOT NULL,
	"invite_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "technical_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_record_id" uuid NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"description" text,
	"file_url" text,
	"source_url" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"role" "user_role" DEFAULT 'Compliance' NOT NULL,
	"mfa_enabled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "attestations" ADD CONSTRAINT "attestations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "attestations" ADD CONSTRAINT "attestations_signatory_id_users_id_fk" FOREIGN KEY ("signatory_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "contracts" ADD CONSTRAINT "contracts_prime_organization_id_organizations_id_fk" FOREIGN KEY ("prime_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sub_organization_id_organizations_id_fk" FOREIGN KEY ("sub_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_history" ADD CONSTRAINT "control_history_control_implementation_id_control_implementations_id_fk" FOREIGN KEY ("control_implementation_id") REFERENCES "public"."control_implementations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_history" ADD CONSTRAINT "control_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_responsible_owner_id_users_id_fk" FOREIGN KEY ("responsible_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_records" ADD CONSTRAINT "control_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_records" ADD CONSTRAINT "control_records_responsible_role_id_roles_id_fk" FOREIGN KEY ("responsible_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "control_records" ADD CONSTRAINT "control_records_assessor_id_users_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "controls" ADD CONSTRAINT "controls_control_family_id_control_families_id_fk" FOREIGN KEY ("control_family_id") REFERENCES "public"."control_families"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_flows" ADD CONSTRAINT "data_flows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_control_links" ADD CONSTRAINT "evidence_control_links_evidence_metadata_id_evidence_metadata_id_fk" FOREIGN KEY ("evidence_metadata_id") REFERENCES "public"."evidence_metadata"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_control_links" ADD CONSTRAINT "evidence_control_links_control_implementation_id_control_implementations_id_fk" FOREIGN KEY ("control_implementation_id") REFERENCES "public"."control_implementations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_metadata" ADD CONSTRAINT "evidence_metadata_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_metadata" ADD CONSTRAINT "evidence_metadata_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "flowdown_requirements" ADD CONSTRAINT "flowdown_requirements_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "flowdown_requirements" ADD CONSTRAINT "flowdown_requirements_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_closure_approvals" ADD CONSTRAINT "poam_closure_approvals_poam_item_id_poam_items_id_fk" FOREIGN KEY ("poam_item_id") REFERENCES "public"."poam_items"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_closure_approvals" ADD CONSTRAINT "poam_closure_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_entries" ADD CONSTRAINT "poam_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_entries" ADD CONSTRAINT "poam_entries_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_entries" ADD CONSTRAINT "poam_entries_responsible_role_id_roles_id_fk" FOREIGN KEY ("responsible_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_items" ADD CONSTRAINT "poam_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_items" ADD CONSTRAINT "poam_items_control_implementation_id_control_implementations_id_fk" FOREIGN KEY ("control_implementation_id") REFERENCES "public"."control_implementations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_items" ADD CONSTRAINT "poam_items_responsible_party_id_users_id_fk" FOREIGN KEY ("responsible_party_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_milestones" ADD CONSTRAINT "poam_milestones_poam_item_id_poam_items_id_fk" FOREIGN KEY ("poam_item_id") REFERENCES "public"."poam_items"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_risk_assessments" ADD CONSTRAINT "poam_risk_assessments_poam_item_id_poam_items_id_fk" FOREIGN KEY ("poam_item_id") REFERENCES "public"."poam_items"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "poam_risk_assessments" ADD CONSTRAINT "poam_risk_assessments_assessed_by_id_users_id_fk" FOREIGN KEY ("assessed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ssp_sections" ADD CONSTRAINT "ssp_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontractor_relationships" ADD CONSTRAINT "subcontractor_relationships_prime_organization_id_organizations_id_fk" FOREIGN KEY ("prime_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontractor_relationships" ADD CONSTRAINT "subcontractor_relationships_sub_organization_id_organizations_id_fk" FOREIGN KEY ("sub_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_evidence" ADD CONSTRAINT "technical_evidence_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "control_records_org_control_idx" ON "control_records" USING btree ("organization_id","control_id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "controls_control_id_idx" ON "controls" USING btree ("control_id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX "evidence_metadata_evidence_id_org_idx" ON "evidence_metadata" USING btree ("organization_id","evidence_id"); EXCEPTION WHEN duplicate_object THEN NULL; END $$;