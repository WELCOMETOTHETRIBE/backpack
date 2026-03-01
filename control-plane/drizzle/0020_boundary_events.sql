CREATE TABLE IF NOT EXISTS "boundary_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "account_boundary"("account_id") ON DELETE CASCADE,
  "boundary_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "boundary_events_account_created_idx" ON "boundary_events" USING btree ("account_id", "created_at");
CREATE INDEX IF NOT EXISTS "boundary_events_boundary_id_idx" ON "boundary_events" USING btree ("boundary_id");
