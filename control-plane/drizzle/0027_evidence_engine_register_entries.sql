-- Evidence Engine: register entry status and cadence.
DO $$ BEGIN CREATE TYPE "public"."register_entry_status" AS ENUM('draft', 'final'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "default_cadence_days" integer;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "entry_type" varchar(80);
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "status" "register_entry_status" DEFAULT 'draft' NOT NULL;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "approved_by_id" uuid REFERENCES "public"."users"("id");
DO $$ BEGIN ALTER TABLE "governance_register_entries" ADD CONSTRAINT "governance_register_entries_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
