-- SSP scoping fields on organizations table
-- These anchor the System Security Plan and Authorization Boundary Statement.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_name" varchar(255);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_description" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "authorization_boundary_statement" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_owner_name" varchar(255);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "system_owner_email" varchar(255);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "isso_name" varchar(255);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "isso_email" varchar(255);
-- JSON array of strings: DFARS/DoD CUI category identifiers
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "cui_categories" jsonb;
-- JSON array of {name, serviceType, dataTypes, inheritedControls, website}
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "external_service_providers" jsonb;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "boundary_narrative" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "boundary_scoping_completed_at" timestamptz;
