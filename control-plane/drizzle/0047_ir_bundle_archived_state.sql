-- IR Tabletop Phase 7: frozen state snapshot at archive time.
-- Adds archived_state_snapshot_json to ir_exercise_bundles. The snapshot
-- captures every input the bundle was generated from so the assessor can
-- always read the authoritative state-at-archive even if live data evolves.

ALTER TABLE "ir_exercise_bundles"
  ADD COLUMN IF NOT EXISTS "archived_state_snapshot_json" jsonb;
