-- Migration: feedback resolution provenance
-- When the incorporate-feedback agent resolves an item, it now records
-- the commit SHA, GitHub URL, summary, and the list of files changed
-- so the Resolved tab can show what was actually shipped.

ALTER TABLE "feedback"
  ADD COLUMN IF NOT EXISTS "resolution_commit_sha"  TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_commit_url"  TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_summary"     TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_files"       JSONB;
