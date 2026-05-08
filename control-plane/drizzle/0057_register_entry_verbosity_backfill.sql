-- Phase 4 — Register-Automation v1.1 §7: Verbosity hardening backfill
--
-- Every existing register entry should carry the §1 auditor-defensible
-- field set (lifecycle_state + evidence_refs[] at minimum) so the codex
-- and EnclaveWatch UI can render uniform navigability across all
-- entries — even ones written by the pre-Phase-4 handlers.
--
-- New entries written post-Phase-4 already have these fields populated
-- by the handler layer (see src/lib/evidence-engine/isso-export/
-- handlers/_verbosity.ts). This migration covers historical entries.
--
-- Strategy
-- --------
-- For every governance_register_entries row that doesn't already carry a
-- lifecycle_state, derive a value from its existing status column:
--
--   status = 'final' AND has admin signature       -> 'admin_signed'
--   status = 'final' AND has ISSO verification     -> 'isso_verified'
--   status = 'final' otherwise                     -> 'auto_recorded_legacy'
--                                                     (preserves the
--                                                     blueprint convention
--                                                     of marking pre-Phase-4
--                                                     auto-final entries)
--   status = 'draft'                               -> 'draft'
--
-- evidence_refs[] is set to [] when missing (auditor sees "no refs"
-- explicitly rather than "field forgotten"). Subsequent ISSO weekly
-- exports that touch the entry will append a manifest_id ref, so the
-- empty default is short-lived in practice.
--
-- Idempotent — re-running this migration is a no-op because of the NOT
-- (entry_data ? 'lifecycle_state') guard.
--
-- This migration leaves entry_data otherwise untouched. It does NOT add
-- the other §1 fields (actor_*, event_type, time anchors, etc.) on
-- legacy entries — those are domain-specific and would require per-
-- entry-type logic. The backfill keeps minimum-bar legacy entries
-- queryable by lifecycle without forcing an export replay.

UPDATE governance_register_entries
SET entry_data = entry_data
  || jsonb_build_object(
       'lifecycle_state', CASE
         -- Entries already touched by the Phase 1 privileged-grant
         -- backfill (0055) carry 'auto_recorded_legacy'; that takes
         -- precedence and the NOT (entry_data ? 'lifecycle_state') guard
         -- below ensures we don't clobber them.
         WHEN status = 'final'
           AND (entry_data ? 'isso_verified_at' OR entry_data ? 'verified_at')
           THEN 'isso_verified'
         WHEN status = 'final'
           AND (entry_data ? 'acknowledged_by'
                OR entry_data ? 'admin_justified_at'
                OR entry_data ? 'admin_acknowledged_at'
                OR entry_data ? 'signed_at')
           THEN 'admin_signed'
         WHEN status = 'final' THEN 'auto_recorded_legacy'
         WHEN status = 'draft' THEN 'draft'
         ELSE 'auto_recorded_legacy'
       END,
       'evidence_refs', COALESCE(entry_data->'evidence_refs', '[]'::jsonb)
     )
WHERE NOT (entry_data ? 'lifecycle_state');
