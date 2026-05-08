-- Idempotent patch: ensures columns added in migration 0037 are present.
-- 0037 was recorded as applied in __drizzle_migrations before IF NOT EXISTS
-- guards were added, so some columns were never actually created.
ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "control_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "validation_method" text;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "technical_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_narrative" text;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN IF NOT EXISTS "policy_doc_linked_at" timestamp with time zone;--> statement-breakpoint
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
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "boundary_scoping_completed_at" timestamp with time zone;
