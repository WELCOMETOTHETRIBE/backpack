-- Phase 12: org-scope custom scenarios.
-- Adds nullable organization_id to ir_scenarios:
--   NULL  = global library (the seeded SCEN-A..D rows)
--   set   = scoped to a single tenant (custom scenarios authored by that org)
-- listScenarios endpoint filters: WHERE is_active AND (organization_id IS NULL
-- OR organization_id = $callerOrgId).
--
-- Existing rows are NULL → remain global → no behavior change.

ALTER TABLE "ir_scenarios"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_scenarios" ADD CONSTRAINT "ir_scenarios_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_scenarios_organization_id_idx"
  ON "ir_scenarios" ("organization_id");
