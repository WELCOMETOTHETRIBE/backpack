-- Non-upload governance artifact completion (REFERENCE, ATTESTATION, SYSTEM_POINTER). Idempotent.
CREATE TABLE IF NOT EXISTS "governance_artifact_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "control_record_id" uuid NOT NULL REFERENCES "control_records"("id") ON DELETE CASCADE,
  "artifact_label" varchar(255) NOT NULL,
  "artifact_type" varchar(32) NOT NULL,
  "value_text" text,
  "attested_by" uuid REFERENCES "users"("id"),
  "attested_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "governance_artifact_completions_record_label" ON "governance_artifact_completions" ("control_record_id", "artifact_label");
