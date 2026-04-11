-- Migration 0034: Governance Manifest Ingest Pipeline
-- Adds tables to track governance bundle manifest ingest runs and
-- the resulting document-to-control satisfaction links.

CREATE TABLE IF NOT EXISTS "governance_manifest_runs" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "run_id"          text NOT NULL,
  "schema_version"  integer NOT NULL DEFAULT 3,
  "bundle_source"   text,
  "ingested_by"     uuid REFERENCES "users"("id"),
  "ingested_at"     timestamptz NOT NULL DEFAULT now(),
  "doc_count"       integer NOT NULL DEFAULT 0,
  UNIQUE ("organization_id", "run_id")
);

CREATE INDEX IF NOT EXISTS "gmr_org_idx" ON "governance_manifest_runs" ("organization_id");

-- Maps individual governance documents (by code) to NIST controls they satisfy.
-- Created/replaced on each ingest run for the documents in that run.
CREATE TABLE IF NOT EXISTS "governance_document_control_links" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "manifest_run_id"      uuid NOT NULL REFERENCES "governance_manifest_runs"("id") ON DELETE CASCADE,
  "doc_code"             text NOT NULL,
  "control_id"           text NOT NULL,
  "satisfaction_type"    text NOT NULL DEFAULT 'primary',
  "created_at"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "gdcl_org_control_idx"
  ON "governance_document_control_links" ("organization_id", "control_id");
