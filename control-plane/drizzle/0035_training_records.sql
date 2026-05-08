-- Migration 0035: Training Records
-- Adds a training_records table to track CMMC 3.2.x security awareness
-- and role-based training completion per organization member.

CREATE TABLE IF NOT EXISTS "training_records" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "personnel_name"  varchar(255) NOT NULL,
  "personnel_email" varchar(255),
  "training_type"   varchar(80)  NOT NULL, -- security_awareness | role_based | insider_threat | other
  "course_title"    varchar(255) NOT NULL,
  "delivery_method" varchar(80),           -- online | classroom | cbt | self_study
  "completed_at"    date NOT NULL,
  "expires_at"      date,
  "evidence_url"    text,                  -- link to completion certificate or screenshot
  "notes"           text,
  "created_by_id"   uuid REFERENCES "users"("id"),
  "created_at"      timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "training_records_org_idx"
  ON "training_records" ("organization_id");

CREATE INDEX IF NOT EXISTS "training_records_email_idx"
  ON "training_records" ("organization_id", "personnel_email");
