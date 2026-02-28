-- Add 'attestation' to governance_evidence_type so MFA and other attestations
-- can be stored in the Evidence Library and linked to controls (e.g. Azure/Entra).
DO $$ BEGIN
  ALTER TYPE "public"."governance_evidence_type" ADD VALUE 'attestation';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
