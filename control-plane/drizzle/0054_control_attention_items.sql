-- Persistent record of every control_freshness.needing_attention[] item the
-- ISSO flags during weekly review. Sprint 3 logged these to /admin/audit-logs
-- only; Sprint 6.5 makes them queryable so the Monitoring tab can surface
-- them as actionable rows.
--
-- Lifecycle:
--   created   — codex ingest writes a row when ISSO flags a control
--   resolved  — admin clicks "mark resolved" or the same control_id appears
--               with a "no longer needs attention" outcome on a later
--               manifest (out of scope for v1; admin-driven for now)
--
-- Index by (organization_id, control_id) so we can quickly answer
-- "is this control flagged?" on dashboard renders. Also index by
-- (organization_id, resolved_at) so the Monitoring tab can pull
-- still-open items.

CREATE TABLE IF NOT EXISTS control_attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  flagged_by_manifest_id TEXT,
  vault_id TEXT,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_attention_org_control
  ON control_attention_items(organization_id, control_id);

CREATE INDEX IF NOT EXISTS idx_attention_org_open
  ON control_attention_items(organization_id, flagged_at DESC)
  WHERE resolved_at IS NULL;
