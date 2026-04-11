-- P1: Dual-evidence adjudication lanes
-- Adds technical_status, policy_doc_required, policy_status, policy_doc_narrative, policy_doc_linked_at
-- to control_records. Seeds policy_doc_required=true for the 18 dual-evidence controls.

ALTER TABLE "control_records"
  ADD COLUMN IF NOT EXISTS "technical_status" text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "policy_doc_required" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "policy_status" text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS "policy_doc_narrative" text,
  ADD COLUMN IF NOT EXISTS "policy_doc_linked_at" timestamptz;

-- Seed policy_doc_required = true and policy_status = 'missing' (since required but not yet satisfied)
-- for the ~18 dual-evidence controls (NIST SP 800-171 Rev.2 control IDs in "3.X.Y" format).
UPDATE "control_records"
SET
  "policy_doc_required" = true,
  "policy_status" = 'missing'
WHERE "control_id" IN (
  '3.4.2',
  '3.4.3',
  '3.4.4',
  '3.5.3',
  '3.5.7',
  '3.7.1',
  '3.8.3',
  '3.8.7',
  '3.11.1',
  '3.11.2',
  '3.13.1',
  '3.13.5',
  '3.13.9',
  '3.13.11',
  '3.13.15',
  '3.14.2',
  '3.14.6',
  '3.14.7'
)
AND "policy_status" = 'not_required';
