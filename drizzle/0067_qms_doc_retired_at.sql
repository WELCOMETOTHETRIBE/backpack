-- Retire-on-absence for QMS-pushed docs.
--
-- Background
-- ----------
-- The QMS-manifest ingest dispatcher (src/app/api/integrations/qms-manifest
-- /ingest/route.ts) inserts every doc carried by a new manifest. It does
-- NOT remove docs that were in prior manifests but disappear from the new
-- one — meaning a doc retired/deleted on the QMS side lives forever on
-- the codex side, surfacing in the new "Library" tab on /dashboard
-- /documents as orphaned pollution. Customer hit this on 2026-05-09 with
-- two test SOPs (MAC-SOP-069, MAC-SOP-255 named literally "test"/"Test")
-- that lingered after QMS-side deletion.
--
-- This migration adds a retired_at column. The dispatcher (this same
-- commit) sets it on the most-recent row of any (org, document_number)
-- whose document_number is absent from the new manifest. The library
-- view filters retired_at IS NULL by default.
--
-- A doc that re-appears in a later manifest writes a fresh row with
-- retired_at = NULL; the old retired row stays as-is (it's not the
-- DISTINCT ON pick anymore, so it doesn't affect the visible library)
-- but its retired_at preserves the audit trail.

ALTER TABLE qms_governance_manifest_documents
  ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- Partial index targeting the active rows the library SQL reads.
CREATE INDEX IF NOT EXISTS qms_doc_active_idx
  ON qms_governance_manifest_documents (organization_id, document_number)
  WHERE retired_at IS NULL;
