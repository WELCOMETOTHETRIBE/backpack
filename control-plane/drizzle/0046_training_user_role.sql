-- Add user_role column to training_records so we can show the audience
-- (All Users / Privileged User / etc.) in the Training register table
-- and persist it consistently from both the in-app form and the
-- server-to-server /api/training/completion ingestion path.
-- Nullable because legacy rows didn't have it; backfilled separately.

ALTER TABLE "training_records"
  ADD COLUMN IF NOT EXISTS "user_role" varchar(80);
