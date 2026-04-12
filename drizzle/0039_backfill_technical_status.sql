-- Backfill technical_status to match implementation_status for existing records.
--
-- When technical_status was added (migration 0037/0038), all existing rows
-- received the column default ('not_started'). Records where the user had
-- already attested implementation in the SCTM were left with
-- implementation_status='implemented' but technical_status='not_started',
-- causing the governance page to show conflicting states.
--
-- Rules (aligned with calculateControlStatus() in lib/control-status.ts):
--   implemented / assessed  → technical_status = 'satisfied'
--   inherited               → technical_status = 'satisfied'
--   not_applicable          → technical_status = 'not_applicable'
--   not_started / in_progress → leave as 'not_started' (already correct default)
--
-- Only touches rows that still have the default value so evidence-engine
-- derived values are not overwritten.

UPDATE control_records
SET technical_status = 'satisfied'
WHERE implementation_status IN ('implemented', 'assessed', 'inherited')
  AND technical_status = 'not_started';

UPDATE control_records
SET technical_status = 'not_applicable'
WHERE implementation_status = 'not_applicable'
  AND technical_status = 'not_started';
