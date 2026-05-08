-- Allow multiple findings per (evidence_run_id, control_id) — one per
-- check_id. Today the PK is (evidence_run_id, control_id), which forces
-- a 1:1 relationship between control and finding and silently breaks any
-- validator that emits multiple checks backing the same control (e.g.
-- Conditional Access policy state — 5 different checks all backing 3.5.3).
--
-- New PK: (evidence_run_id, control_id, check_id). check_id is added as
-- a new NOT NULL column; existing rows are backfilled with check_id =
-- control_id so the constraint stays valid.

ALTER TABLE evidence_finding
  ADD COLUMN IF NOT EXISTS check_id TEXT;

UPDATE evidence_finding
   SET check_id = control_id
 WHERE check_id IS NULL;

ALTER TABLE evidence_finding
  ALTER COLUMN check_id SET NOT NULL;

ALTER TABLE evidence_finding
  DROP CONSTRAINT IF EXISTS evidence_finding_pkey;

ALTER TABLE evidence_finding
  ADD CONSTRAINT evidence_finding_pkey
  PRIMARY KEY (evidence_run_id, control_id, check_id);
