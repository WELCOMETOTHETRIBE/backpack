-- ISSO export manifest dedupe / replay-safety table.
--
-- v1.1 of the ISSO weekly export (POST /api/enclavewatch/isso-export/ingest)
-- carries a content-derived manifest_id (sha256 over canonical body + vault_id +
-- review_period_end). Re-ingesting the same manifest_id is a no-op that returns
-- the cached response. Replay protection at the body level — HMAC + Date skew
-- handles wire-level replay; this table handles application-level replay
-- (vault retried after timeout, network blip, etc.).
--
-- See docs/specs/isso-export-manifest-v1.1.md §7.

CREATE TABLE IF NOT EXISTS isso_export_manifests (
  manifest_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vault_id TEXT,
  manifest_version TEXT NOT NULL DEFAULT '1.1',
  review_period_start TIMESTAMPTZ,
  review_period_end TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_payload JSONB,
  controls_touched JSONB,
  sections_processed JSONB
);

CREATE INDEX IF NOT EXISTS idx_isso_manifests_org_period
  ON isso_export_manifests(organization_id, review_period_end DESC);

CREATE INDEX IF NOT EXISTS idx_isso_manifests_vault
  ON isso_export_manifests(vault_id, received_at DESC);
