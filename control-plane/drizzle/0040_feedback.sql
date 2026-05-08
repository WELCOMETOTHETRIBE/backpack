-- Migration: add feedback table
-- Captures element-pinpoint feedback from authenticated users.

CREATE TYPE "feedback_status" AS ENUM ('pending', 'reviewed', 'resolved');
CREATE TYPE "feedback_category" AS ENUM ('bug', 'ux', 'feature', 'general');

CREATE TABLE "feedback" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id"           UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "content"           TEXT NOT NULL,
  "category"          "feedback_category" NOT NULL DEFAULT 'general',
  "status"            "feedback_status"   NOT NULL DEFAULT 'pending',
  "page_url"          TEXT,
  "element_selector"  TEXT,
  "element_id"        TEXT,
  "element_class"     TEXT,
  "element_text"      TEXT,
  "element_type"      TEXT,
  "reviewed_at"       TIMESTAMPTZ,
  "resolved_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "feedback_org_idx"     ON "feedback"("organization_id");
CREATE INDEX "feedback_status_idx"  ON "feedback"("status");
CREATE INDEX "feedback_created_idx" ON "feedback"("created_at");
