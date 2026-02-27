ALTER TABLE "evidence_run" ADD COLUMN "source" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "evidence_run" ADD COLUMN "boundary_id" text;
--> statement-breakpoint
CREATE TABLE "evidence_finding" (
	"evidence_run_id" uuid NOT NULL,
	"control_id" text NOT NULL,
	"pass" boolean NOT NULL,
	"observed" text NOT NULL,
	"expected" text NOT NULL,
	"evidence_hint" text NOT NULL,
	"evidence_files_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_or_customer" text NOT NULL,
	"layer" text,
	"details" jsonb,
	CONSTRAINT "evidence_finding_evidence_run_id_control_id_pk" PRIMARY KEY("evidence_run_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "evidence_finding" ADD CONSTRAINT "evidence_finding_evidence_run_id_evidence_run_id_fk" FOREIGN KEY ("evidence_run_id") REFERENCES "public"."evidence_run"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "evidence_finding_control_idx" ON "evidence_finding" USING btree ("control_id");
--> statement-breakpoint
CREATE INDEX "evidence_run_boundary_idx" ON "evidence_run" USING btree ("boundary_id");
