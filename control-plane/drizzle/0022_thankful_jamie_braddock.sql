ALTER TYPE "public"."governance_evidence_type" ADD VALUE 'attestation' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "boundary_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"boundary_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_artifact_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_record_id" uuid NOT NULL,
	"artifact_label" varchar(255) NOT NULL,
	"artifact_type" varchar(32) NOT NULL,
	"value_text" text,
	"attested_by" uuid,
	"attested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boundary" ADD COLUMN "cloud_provider" varchar(32);--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "snapshot_signature" text;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "evidence_run_fingerprints" jsonb;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_source" text;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_evidence_run_id" text;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_run_fingerprint" text;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_hash" text;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_totals" jsonb;--> statement-breakpoint
ALTER TABLE "boundary_snapshots" ADD COLUMN "coverage_top_gaps" jsonb;--> statement-breakpoint
ALTER TABLE "control_records" ADD COLUMN "hybrid_satisfaction" jsonb;--> statement-breakpoint
ALTER TABLE "poam_entries" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "poam_entries" ADD COLUMN "closeout_evidence" text;--> statement-breakpoint
ALTER TABLE "evidence_finding" ADD COLUMN "partial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boundary_events" ADD CONSTRAINT "boundary_events_account_id_account_boundary_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_boundary"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_artifact_completions" ADD CONSTRAINT "governance_artifact_completions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_artifact_completions" ADD CONSTRAINT "governance_artifact_completions_control_record_id_control_records_id_fk" FOREIGN KEY ("control_record_id") REFERENCES "public"."control_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_artifact_completions" ADD CONSTRAINT "governance_artifact_completions_attested_by_users_id_fk" FOREIGN KEY ("attested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boundary_events_account_created_idx" ON "boundary_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "boundary_events_boundary_id_idx" ON "boundary_events" USING btree ("boundary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "governance_artifact_completions_record_label" ON "governance_artifact_completions" USING btree ("control_record_id","artifact_label");--> statement-breakpoint
CREATE INDEX "boundary_snapshots_snapshot_signature_idx" ON "boundary_snapshots" USING btree ("snapshot_signature");--> statement-breakpoint
CREATE INDEX "boundary_snapshots_coverage_hash_idx" ON "boundary_snapshots" USING btree ("coverage_hash");--> statement-breakpoint
CREATE INDEX "boundary_snapshots_coverage_run_fp_idx" ON "boundary_snapshots" USING btree ("coverage_run_fingerprint");