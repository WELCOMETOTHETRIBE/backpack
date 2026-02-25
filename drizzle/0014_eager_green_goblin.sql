DO $$ BEGIN CREATE TYPE "public"."governance_control_classification" AS ENUM('PURE_GOV', 'HYBRID_GOV', 'TECHNICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."governance_control_link_type" AS ENUM('document', 'register_entry', 'evidence'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."governance_doc_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RETIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."governance_doc_type" AS ENUM('POLICY', 'SOP', 'PLAN', 'STANDARD', 'CHARTER', 'PROCEDURE', 'TEMPLATE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."governance_evidence_type" AS ENUM('screenshot', 'export_file', 'log_snippet', 'config_baseline', 'policy_export', 'ticket', 'training_record', 'incident_report', 'risk_report', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TYPE "public"."implementation_status" ADD VALUE 'not_applicable'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_control_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_record_id" uuid NOT NULL,
	"link_type" "governance_control_link_type" NOT NULL,
	"link_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_control_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" varchar(20) NOT NULL,
	"classification" "governance_control_classification" NOT NULL,
	"control_statement" text,
	"required_artifact_types" jsonb DEFAULT '[]'::jsonb,
	"required_documents" jsonb DEFAULT '[]'::jsonb,
	"required_registers" jsonb DEFAULT '[]'::jsonb,
	"required_hybrid_evidence_types" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_control_metadata_control_id_unique" UNIQUE("control_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text,
	"sha256_hash" varchar(64),
	"file_size" integer,
	"mime_type" varchar(100),
	"original_filename" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"doc_id" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"type" "governance_doc_type" NOT NULL,
	"domain" varchar(10),
	"version" varchar(50) DEFAULT '1',
	"status" "governance_doc_status" DEFAULT 'DRAFT' NOT NULL,
	"owner_id" uuid,
	"approver_id" uuid,
	"approval_date" date,
	"next_review_date" date,
	"review_cadence_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_item_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text,
	"sha256_hash" varchar(64),
	"file_size" integer,
	"mime_type" varchar(100),
	"original_filename" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"evidence_type" "governance_evidence_type" NOT NULL,
	"source_system" varchar(255),
	"collected_by_id" uuid,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validity_period_days" integer,
	"sha256_hash" varchar(64),
	"implementation_statement" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_register_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" uuid NOT NULL,
	"entry_data" jsonb NOT NULL,
	"created_by_id" uuid,
	"hold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_register_entry_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_entry_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text,
	"sha256_hash" varchar(64),
	"file_size" integer,
	"original_filename" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"project_id" uuid,
	"register_key" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"required_columns" jsonb DEFAULT '[]'::jsonb,
	"retain_for_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'Compliance' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "attestations" ADD COLUMN "comment" text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "cage_code" varchar(10); EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_address" text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_contact_name" varchar(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "organizations" ADD COLUMN "primary_contact_email" varchar(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_control_links" ADD CONSTRAINT "governance_control_links_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_document_versions" ADD CONSTRAINT "governance_document_versions_document_id_governance_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."governance_documents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_document_versions" ADD CONSTRAINT "governance_document_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_documents" ADD CONSTRAINT "governance_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_documents" ADD CONSTRAINT "governance_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_documents" ADD CONSTRAINT "governance_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_documents" ADD CONSTRAINT "governance_documents_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_evidence_files" ADD CONSTRAINT "governance_evidence_files_evidence_item_id_governance_evidence_items_id_fk" FOREIGN KEY ("evidence_item_id") REFERENCES "public"."governance_evidence_items"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_evidence_items" ADD CONSTRAINT "governance_evidence_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_evidence_items" ADD CONSTRAINT "governance_evidence_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_evidence_items" ADD CONSTRAINT "governance_evidence_items_collected_by_id_users_id_fk" FOREIGN KEY ("collected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_register_id_governance_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."governance_registers"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_register_entry_files" ADD CONSTRAINT "governance_register_entry_files_register_entry_id_governance_register_entries_id_fk" FOREIGN KEY ("register_entry_id") REFERENCES "public"."governance_register_entries"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_registers" ADD CONSTRAINT "governance_registers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "governance_registers" ADD CONSTRAINT "governance_registers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;