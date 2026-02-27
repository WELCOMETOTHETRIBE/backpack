ALTER TABLE "boundary" ADD COLUMN IF NOT EXISTS "scope_components" jsonb;--> statement-breakpoint
ALTER TABLE "boundary" ADD COLUMN IF NOT EXISTS "azure_environment" varchar(32);