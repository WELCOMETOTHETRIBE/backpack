ALTER TABLE "evidence_finding" ADD COLUMN IF NOT EXISTS "partial" boolean DEFAULT false NOT NULL;
