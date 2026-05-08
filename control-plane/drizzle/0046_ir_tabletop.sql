-- IR Tabletop & AAR Evidence Kit (Phase 1b)
-- Adds: organizations.default_ir_retention_years, 9 new ir_* tables, supporting enums.
-- Idempotent: uses IF NOT EXISTS / DO blocks for safe re-runs.
-- Defensibility: see src/db/schema.ir-tabletop.ts header comment.

-- ============== organizations: default IR retention years ==============
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "default_ir_retention_years" integer NOT NULL DEFAULT 6;
--> statement-breakpoint

-- ============== Enums ==============
DO $$ BEGIN
  CREATE TYPE "ir_exercise_status" AS ENUM (
    'draft','scheduled','in_progress','executed','aar_drafted','approved','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_exercise_methodology" AS ENUM ('tabletop','walkthrough','functional');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_participant_role" AS ENUM (
    'facilitator','approver','executive','it_admin','program_manager',
    'security_lead','mactech_support','observer','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_inject_response_status" AS ENUM ('pass','partial','fail','not_reached');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_aar_final_result" AS ENUM ('pass','partial','needs_remediation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_finding_severity" AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "ir_corrective_action_status" AS ENUM (
    'open','in_progress','blocked','completed','deferred'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ============== ir_scenarios (catalog) ==============
CREATE TABLE IF NOT EXISTS "ir_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(32) NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "narrative" text NOT NULL,
  "targeted_control_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "default_roe" text NOT NULL,
  "injects_json" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ir_scenarios_code_version_idx"
  ON "ir_scenarios" USING btree ("code", "version");
--> statement-breakpoint

-- ============== ir_exercises ==============
CREATE TABLE IF NOT EXISTS "ir_exercises" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "boundary_id" text,
  "scenario_id" uuid NOT NULL,
  "scenario_snapshot_json" jsonb,
  "name" text NOT NULL,
  "methodology" ir_exercise_methodology NOT NULL,
  "methodology_justification" text NOT NULL,
  "scope_statement" text NOT NULL,
  "cui_categories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "customer_name" text NOT NULL,
  "contract_program_name" text,
  "system_name" text NOT NULL,
  "environment_description" text NOT NULL,
  "reporting_authorities_json" jsonb NOT NULL,
  "scheduled_for" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "facilitator_user_id" uuid,
  "approver_user_id" uuid,
  "status" ir_exercise_status NOT NULL DEFAULT 'draft',
  "retention_until" date,
  "legal_hold_active" boolean NOT NULL DEFAULT false,
  "legal_hold_reason" text,
  "legal_hold_set_by_user_id" uuid,
  "legal_hold_set_at" timestamp with time zone,
  "planner_notes" text,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_scenario_id_fk"
    FOREIGN KEY ("scenario_id") REFERENCES "ir_scenarios"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_facilitator_user_id_fk"
    FOREIGN KEY ("facilitator_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_approver_user_id_fk"
    FOREIGN KEY ("approver_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_legal_hold_user_id_fk"
    FOREIGN KEY ("legal_hold_set_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercises" ADD CONSTRAINT "ir_exercises_created_by_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercises_org_idx" ON "ir_exercises" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercises_status_idx" ON "ir_exercises" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercises_boundary_idx" ON "ir_exercises" ("boundary_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercises_scheduled_idx" ON "ir_exercises" ("scheduled_for");
--> statement-breakpoint

-- ============== ir_exercise_controls (link, snapshot) ==============
CREATE TABLE IF NOT EXISTS "ir_exercise_controls" (
  "exercise_id" uuid NOT NULL,
  "control_id" varchar(30) NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("exercise_id", "control_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_controls" ADD CONSTRAINT "ir_exercise_controls_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "ir_exercises"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercise_controls_control_idx"
  ON "ir_exercise_controls" ("control_id");
--> statement-breakpoint

-- ============== ir_exercise_participants ==============
CREATE TABLE IF NOT EXISTS "ir_exercise_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id" uuid NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "organization" text NOT NULL,
  "title" text,
  "role" ir_participant_role NOT NULL,
  "email" varchar(320),
  "attended_at" timestamp with time zone,
  "attestation_signature_ref" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_participants" ADD CONSTRAINT "ir_exercise_participants_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "ir_exercises"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_participants" ADD CONSTRAINT "ir_exercise_participants_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercise_participants_exercise_idx"
  ON "ir_exercise_participants" ("exercise_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercise_participants_user_idx"
  ON "ir_exercise_participants" ("user_id");
--> statement-breakpoint

-- ============== ir_inject_responses ==============
CREATE TABLE IF NOT EXISTS "ir_inject_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id" uuid NOT NULL,
  "inject_key" varchar(64) NOT NULL,
  "inject_prompt_snapshot" text NOT NULL,
  "expected_action_snapshot" text NOT NULL,
  "status" ir_inject_response_status NOT NULL,
  "actual_response_notes" text,
  "decision_offset_minutes" integer,
  "decision_timestamp" timestamp with time zone,
  "recorded_by_user_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_inject_responses" ADD CONSTRAINT "ir_inject_responses_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "ir_exercises"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_inject_responses" ADD CONSTRAINT "ir_inject_responses_recorded_by_user_id_fk"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ir_inject_responses_exercise_inject_idx"
  ON "ir_inject_responses" ("exercise_id", "inject_key");
--> statement-breakpoint

-- ============== ir_aars ==============
CREATE TABLE IF NOT EXISTS "ir_aars" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id" uuid NOT NULL UNIQUE,
  "executive_summary" text,
  "timeline_narrative" text,
  "strengths" text,
  "gaps" text,
  "evidence_reviewed" text,
  "final_result" ir_aar_final_result,
  "drafted_by_user_id" uuid,
  "drafted_at" timestamp with time zone,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "approval_signature_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_aars" ADD CONSTRAINT "ir_aars_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "ir_exercises"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_aars" ADD CONSTRAINT "ir_aars_drafted_by_user_id_fk"
    FOREIGN KEY ("drafted_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_aars" ADD CONSTRAINT "ir_aars_approved_by_user_id_fk"
    FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- C3PAO defensibility: drafter must differ from approver when both are set.
DO $$ BEGIN
  ALTER TABLE "ir_aars" ADD CONSTRAINT "ir_aars_drafter_approver_distinct"
    CHECK (
      "approved_by_user_id" IS NULL
      OR "drafted_by_user_id" IS NULL
      OR "approved_by_user_id" <> "drafted_by_user_id"
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_aars_drafted_by_idx" ON "ir_aars" ("drafted_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_aars_approved_by_idx" ON "ir_aars" ("approved_by_user_id");
--> statement-breakpoint

-- ============== ir_findings ==============
CREATE TABLE IF NOT EXISTS "ir_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "aar_id" uuid NOT NULL,
  "control_id" varchar(30) NOT NULL,
  "severity" ir_finding_severity NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "linked_adjudication_id" uuid,
  "linked_poam_entry_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_findings" ADD CONSTRAINT "ir_findings_aar_id_fk"
    FOREIGN KEY ("aar_id") REFERENCES "ir_aars"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_findings" ADD CONSTRAINT "ir_findings_linked_adjudication_id_fk"
    FOREIGN KEY ("linked_adjudication_id") REFERENCES "control_adjudications"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_findings_aar_idx" ON "ir_findings" ("aar_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_findings_control_idx" ON "ir_findings" ("control_id");
--> statement-breakpoint

-- ============== ir_corrective_actions ==============
CREATE TABLE IF NOT EXISTS "ir_corrective_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "finding_id" uuid NOT NULL,
  "weakness" text NOT NULL,
  "control_reference" varchar(30) NOT NULL,
  "resources_required" text,
  "scheduled_completion_date" date,
  "milestones_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" ir_corrective_action_status NOT NULL DEFAULT 'open',
  "owner_user_id" uuid,
  "owner_name" text,
  "notes" text,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_corrective_actions" ADD CONSTRAINT "ir_corrective_actions_finding_id_fk"
    FOREIGN KEY ("finding_id") REFERENCES "ir_findings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_corrective_actions" ADD CONSTRAINT "ir_corrective_actions_owner_user_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_corrective_actions_finding_idx"
  ON "ir_corrective_actions" ("finding_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_corrective_actions_status_idx"
  ON "ir_corrective_actions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_corrective_actions_owner_idx"
  ON "ir_corrective_actions" ("owner_user_id");
--> statement-breakpoint

-- ============== ir_exercise_bundles ==============
CREATE TABLE IF NOT EXISTS "ir_exercise_bundles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "exercise_id" uuid NOT NULL,
  "evidence_run_id" uuid NOT NULL,
  "bundle_version" integer NOT NULL DEFAULT 1,
  "manifest_json" jsonb NOT NULL,
  "manifest_sha256" varchar(64) NOT NULL,
  "timestamp_token" text,
  "timestamped_at" timestamp with time zone,
  "retention_until" date,
  "generated_by_user_id" uuid,
  "storage_prefix" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_bundles" ADD CONSTRAINT "ir_exercise_bundles_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "ir_exercises"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_bundles" ADD CONSTRAINT "ir_exercise_bundles_evidence_run_id_fk"
    FOREIGN KEY ("evidence_run_id") REFERENCES "evidence_run"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_exercise_bundles" ADD CONSTRAINT "ir_exercise_bundles_generated_by_user_id_fk"
    FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ir_exercise_bundles_exercise_version_idx"
  ON "ir_exercise_bundles" ("exercise_id", "bundle_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_exercise_bundles_evidence_run_idx"
  ON "ir_exercise_bundles" ("evidence_run_id");
