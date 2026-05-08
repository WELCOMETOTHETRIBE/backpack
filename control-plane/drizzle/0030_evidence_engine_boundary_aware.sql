-- Part 1: Boundary type on boundary table
ALTER TABLE "boundary" ADD COLUMN IF NOT EXISTS "boundary_type" varchar(32) NOT NULL DEFAULT 'cui_enclave';
UPDATE "boundary" SET "boundary_type" = 'cui_enclave' WHERE "boundary_type" IS NULL OR "boundary_type" = '';
CREATE INDEX IF NOT EXISTS "boundary_org_type_idx" ON "boundary" ("organization_id", "boundary_type");

-- Part 2: boundary_id on Evidence Engine tables (add nullable, backfill, then NOT NULL + FK)
-- governance_register_entries
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "boundary_id" uuid;
UPDATE "governance_register_entries" e
SET "boundary_id" = (
  SELECT b.id FROM "boundary" b
  INNER JOIN "governance_registers" r ON r.organization_id = b.organization_id
  WHERE r.id = e.register_id
  ORDER BY b.created_at
  LIMIT 1
)
WHERE e."boundary_id" IS NULL;
ALTER TABLE "governance_register_entries" ALTER COLUMN "boundary_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_boundary_id_boundary_id_fk"
    FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "gov_register_entries_boundary_register_idx" ON "governance_register_entries" ("boundary_id", "register_id");

-- governance_register_entry_files
ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "boundary_id" uuid;
UPDATE "governance_register_entry_files" f
SET "boundary_id" = e.boundary_id
FROM "governance_register_entries" e
WHERE f.register_entry_id = e.id AND f."boundary_id" IS NULL;
ALTER TABLE "governance_register_entry_files" ALTER COLUMN "boundary_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "governance_register_entry_files" ADD CONSTRAINT "governance_register_entry_files_boundary_id_boundary_id_fk"
    FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "gov_entry_files_boundary_entry_idx" ON "governance_register_entry_files" ("boundary_id", "register_entry_id");

-- governance_entry_events
ALTER TABLE "governance_entry_events" ADD COLUMN IF NOT EXISTS "boundary_id" uuid;
UPDATE "governance_entry_events" ev
SET "boundary_id" = e.boundary_id
FROM "governance_register_entries" e
WHERE ev.entry_id = e.id AND ev."boundary_id" IS NULL;
ALTER TABLE "governance_entry_events" ALTER COLUMN "boundary_id" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "governance_entry_events" ADD CONSTRAINT "governance_entry_events_boundary_id_boundary_id_fk"
    FOREIGN KEY ("boundary_id") REFERENCES "public"."boundary"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "gov_entry_events_org_boundary_entry_idx" ON "governance_entry_events" ("org_id", "boundary_id", "entry_id");
