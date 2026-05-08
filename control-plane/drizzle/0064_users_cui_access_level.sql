-- Migrate the boundary-personnel "general" vs "privileged" classification
-- from browser localStorage to a real DB column.
--
-- Two distinct concepts in this system that the UI conflated:
--   users.role            (Admin/Compliance/Assessor) — Codex platform role
--   users.cui_access_level (general/privileged)        — privilege INSIDE the
--                                                        CUI environment
-- being assessed; drives which AT.L2-3.2.x training applies.
--
-- An Admin compliance officer might have NO CUI access; a regular
-- Compliance user might be a CUI sysadmin. They're orthogonal — keep
-- them as separate columns.
--
-- Default is 'general' so existing users land in the safer (lower-privilege)
-- bucket. Admins reclassify via Settings → User Management.

-- 1. Enum type. CREATE TYPE has no IF NOT EXISTS, so wrap in a DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cui_access_level') THEN
    CREATE TYPE cui_access_level AS ENUM ('general', 'privileged');
  END IF;
END $$;

-- 2. Column on users.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "cui_access_level" cui_access_level NOT NULL DEFAULT 'general';
