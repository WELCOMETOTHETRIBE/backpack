-- Evidence Engine: immutability, chain of custody, cadence override, exportable, entry events.
ALTER TYPE "public"."register_entry_status" ADD VALUE IF NOT EXISTS 'void';

ALTER TABLE "governance_registers" ADD COLUMN IF NOT EXISTS "cadence_override_days" integer;

ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "locked_by_id" uuid REFERENCES "public"."users"("id");
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "voided_by_id" uuid REFERENCES "public"."users"("id");
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "void_reason" text;
ALTER TABLE "governance_register_entries" ADD COLUMN IF NOT EXISTS "exportable" boolean DEFAULT false;

ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "uploaded_by_id" uuid REFERENCES "public"."users"("id");
ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp with time zone DEFAULT now();
ALTER TABLE "governance_register_entry_files" ADD COLUMN IF NOT EXISTS "exportable" boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS "governance_entry_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "entry_id" uuid NOT NULL REFERENCES "public"."governance_register_entries"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "public"."users"("id"),
  "event_type" text NOT NULL,
  "event_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_json" jsonb
);

CREATE INDEX IF NOT EXISTS "governance_entry_events_org_id_idx" ON "governance_entry_events" ("org_id");
CREATE INDEX IF NOT EXISTS "governance_entry_events_entry_id_idx" ON "governance_entry_events" ("entry_id");
