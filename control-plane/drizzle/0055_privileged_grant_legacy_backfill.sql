-- Phase 1 — Privileged Grant Acknowledgments — legacy backfill
--
-- Pre-existing access_authorization grant_access entries with
--   entry_data->>'requested_role' = 'privileged_admin'
-- predate the privileged_grant_acknowledgment loop. The brief says these
-- should NOT trigger retroactive admin justification, but should be
-- visibly tagged as legacy on the entry list.
--
-- Strategy: only touch entries that don't already have lifecycle_state
-- so this migration is idempotent and safe to re-run if needed. For each
-- legacy privileged grant, set:
--   lifecycle_state    = 'auto_recorded_legacy'
--   evidence_refs      = []   (preserved if already present)
--   legacy_phase1_tag  = true (one-time marker so the UI can filter)
--
-- We do NOT create a sibling privileged_grant_acknowledgment entry for
-- legacy grants. The intent is "leave the historical record alone, just
-- mark it." If the operator wants retroactive coverage, they can manually
-- re-trigger the bulk-upsert against the same event_ids.

UPDATE governance_register_entries
SET entry_data = entry_data
  || jsonb_build_object(
       'lifecycle_state', 'auto_recorded_legacy',
       'evidence_refs', COALESCE(entry_data->'evidence_refs', '[]'::jsonb),
       'legacy_phase1_tag', true
     )
WHERE entry_type = 'grant_access'
  AND entry_data ->> 'requested_role' = 'privileged_admin'
  AND NOT (entry_data ? 'lifecycle_state');
