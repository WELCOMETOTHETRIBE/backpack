-- Evidence Engine: control responsibilities (CUI Vault model per org/boundary).
CREATE TABLE IF NOT EXISTS "governance_control_responsibilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE CASCADE,
  "boundary_id" text,
  "control_id" text NOT NULL,
  "responsibility_model" text NOT NULL,
  "azure_inherited_json" jsonb,
  "mactech_provided_json" jsonb,
  "customer_required_json" jsonb,
  "notes_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "governance_control_responsibilities_org_id_idx" ON "governance_control_responsibilities" ("org_id");
CREATE INDEX IF NOT EXISTS "governance_control_responsibilities_boundary_id_idx" ON "governance_control_responsibilities" ("boundary_id");
CREATE INDEX IF NOT EXISTS "governance_control_responsibilities_control_id_idx" ON "governance_control_responsibilities" ("control_id");
CREATE UNIQUE INDEX IF NOT EXISTS "governance_control_responsibilities_org_boundary_control_idx"
  ON "governance_control_responsibilities" ("org_id", COALESCE("boundary_id", ''), "control_id");
