-- Add closeout fields to poam_entries for auto-close via attestation and manual closure.
ALTER TABLE "poam_entries" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE "poam_entries" ADD COLUMN IF NOT EXISTS "closeout_evidence" text;
