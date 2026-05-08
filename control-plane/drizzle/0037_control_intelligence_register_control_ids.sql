CREATE TABLE IF NOT EXISTS "control_evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_record_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"file_path" text NOT NULL,
	"sha256_hash" text NOT NULL,
	"description" text,
	"source" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"linked_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_document_control_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"manifest_run_id" uuid NOT NULL,
	"doc_code" text NOT NULL,
	"control_id" text NOT NULL,
	"satisfaction_type" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_manifest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"schema_version" integer DEFAULT 3 NOT NULL,
	"bundle_source" text,
	"ingested_by" uuid,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"personnel_name" varchar(255) NOT NULL,
	"personnel_email" varchar(255),
	"training_type" varchar(80) NOT NULL,
	"course_title" varchar(255) NOT NULL,
	"delivery_method" varchar(80),
	"completed_at" date NOT NULL,
	"expires_at" date,
	"evidence_url" text,
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "validation_method" text;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "technical_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_narrative" text;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "control_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_name" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_description" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "authorization_boundary_statement" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_owner_name" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_owner_email" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "isso_name" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "isso_email" varchar(255);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cui_categories" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "external_service_providers" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "boundary_narrative" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "boundary_scoping_completed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'control_evidence_links_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "control_evidence_links" ADD CONSTRAINT "control_evidence_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'control_evidence_links_control_record_id_control_records_id_fk'
  ) THEN
    ALTER TABLE "control_evidence_links" ADD CONSTRAINT "control_evidence_links_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'control_evidence_links_linked_by_users_id_fk'
  ) THEN
    ALTER TABLE "control_evidence_links" ADD CONSTRAINT "control_evidence_links_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_document_control_links_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "governance_document_control_links" ADD CONSTRAINT "governance_document_control_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_document_control_links_manifest_run_id_governance_manifest_runs_id_fk'
  ) THEN
    ALTER TABLE "governance_document_control_links" ADD CONSTRAINT "governance_document_control_links_manifest_run_id_governance_manifest_runs_id_fk" FOREIGN KEY ("manifest_run_id") REFERENCES "public"."governance_manifest_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_manifest_runs_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "governance_manifest_runs" ADD CONSTRAINT "governance_manifest_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'governance_manifest_runs_ingested_by_users_id_fk'
  ) THEN
    ALTER TABLE "governance_manifest_runs" ADD CONSTRAINT "governance_manifest_runs_ingested_by_users_id_fk" FOREIGN KEY ("ingested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_records_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "training_records" ADD CONSTRAINT "training_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_records_created_by_id_users_id_fk'
  ) THEN
    ALTER TABLE "training_records" ADD CONSTRAINT "training_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cel_org_control_idx" ON "control_evidence_links" USING btree ("organization_id","control_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gdcl_org_control_idx" ON "governance_document_control_links" USING btree ("organization_id","control_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gmr_org_run_idx" ON "governance_manifest_runs" USING btree ("organization_id","run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gmr_org_idx" ON "governance_manifest_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_records_org_idx" ON "training_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_records_email_idx" ON "training_records" USING btree ("organization_id","personnel_email");
