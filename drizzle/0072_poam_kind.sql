-- ============================================================
-- Tier 2 #5: poam_entries.kind discriminator
--
-- Per CMMC L2 Assessment Guide v2.13 page 204:
--   "An operational plan of action in accordance with CA.L2-3.12.2
--    differs from a CMMC assessment POA&M as described in 32 CFR §
--    170.21. … Operational plans of action are not subject to the 180
--    day POA&M closeout requirement."
--
-- Two kinds:
--   operational — routine remediation under CA.L2-3.12.2. No 180-day
--                 cap. Auto-POA&Ms-on-NOT-MET land here.
--   assessment  — OSA-declared, claims a Conditional Level 2 CMMC
--                 Status (Self / C3PAO / DIBCAC). Hard 180-day cap.
--                 Admin action required to set.
-- ============================================================

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'operational';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'poam_entries_kind_chk'
  ) THEN
    ALTER TABLE poam_entries
      ADD CONSTRAINT poam_entries_kind_chk
      CHECK (kind IN ('operational', 'assessment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS poam_entries_org_kind_idx
  ON poam_entries (organization_id, kind, status);
