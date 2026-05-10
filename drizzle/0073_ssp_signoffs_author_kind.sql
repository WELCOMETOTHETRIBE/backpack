-- ============================================================
-- Widen ssp_signoffs_kind_chk to include 'author'.
--
-- The author-attestation flow (commit 76f3488) records a single
-- generate-time provenance row with kind='author', signature_alg=
-- 'codex_author_attestation'. The original CHECK constraint added by
-- migration 0068 limited signoff_kind to four values
-- (authorizing_official, system_owner, isso, environment_unchanged),
-- causing every Submit-to-Doc-Control click to fail with:
--
--   ERROR: new row for relation "ssp_signoffs" violates check
--   constraint "ssp_signoffs_kind_chk"
--
-- Drop and re-add the constraint with 'author' included. The release
-- signature chain (Reviewer / Approver / Quality Release) lives on
-- QMS side per the v2.13 page-204 separation; 'author' here is
-- submission-provenance only.
-- ============================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ssp_signoffs_kind_chk'
  ) THEN
    ALTER TABLE ssp_signoffs DROP CONSTRAINT ssp_signoffs_kind_chk;
  END IF;
  ALTER TABLE ssp_signoffs
    ADD CONSTRAINT ssp_signoffs_kind_chk
    CHECK (signoff_kind IN (
      'authorizing_official',
      'system_owner',
      'isso',
      'environment_unchanged',
      'author'
    ));
END $$;
