-- Migration: Add control_ids to governance_registers
-- Stores the NIST SP 800-171 control IDs that each register satisfies.
-- Populated by the control intelligence seeder; used for register-to-control
-- linking on the SCTM control detail page and compliance registers dashboard.

ALTER TABLE "governance_registers"
  ADD COLUMN IF NOT EXISTS "control_ids" jsonb DEFAULT '[]'::jsonb;
