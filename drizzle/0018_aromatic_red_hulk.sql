ALTER TABLE "evidence_run" ADD COLUMN "run_fingerprint" text;
--> statement-breakpoint
UPDATE "evidence_run" SET "run_fingerprint" = 'legacy-' || "id"::text WHERE "run_fingerprint" IS NULL;
--> statement-breakpoint
ALTER TABLE "evidence_run" ALTER COLUMN "run_fingerprint" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "evidence_run_fingerprint_idx" ON "evidence_run" USING btree ("run_fingerprint");
--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_run_org_fingerprint_unique" ON "evidence_run" USING btree ("organization_id","run_fingerprint");
