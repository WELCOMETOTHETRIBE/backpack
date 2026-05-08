-- Phase 11 Tier 1: difficulty levels + custom scenario provenance.
-- Idempotent (uses IF NOT EXISTS / DO blocks).
-- Note: MITRE ATT&CK TTP arrays live inside ir_scenarios.injects_json (jsonb)
-- and ir_exercises.scenario_snapshot_json (jsonb), so no new column is needed
-- for those — the schema is permissive on the JSONB shape.

-- ============== Difficulty enum ==============
DO $$ BEGIN
  CREATE TYPE "ir_exercise_difficulty" AS ENUM ('management', 'mixed', 'technical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ============== ir_exercises.difficulty ==============
ALTER TABLE "ir_exercises"
  ADD COLUMN IF NOT EXISTS "difficulty" ir_exercise_difficulty NOT NULL DEFAULT 'mixed';
--> statement-breakpoint

-- ============== ir_scenarios provenance flags (for Phase 12 custom-scenario UI) ==============
ALTER TABLE "ir_scenarios"
  ADD COLUMN IF NOT EXISTS "is_custom" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "ir_scenarios"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ir_scenarios" ADD CONSTRAINT "ir_scenarios_created_by_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ir_scenarios_is_custom_idx" ON "ir_scenarios" ("is_custom");
