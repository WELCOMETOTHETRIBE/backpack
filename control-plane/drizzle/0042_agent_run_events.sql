-- Migration: agent run events table
-- Decouples long-running AI agent jobs from HTTP connections.
-- POST /api/ai/incorporate-feedback starts a run and returns runId.
-- The agent writes events here. Client polls GET ?runId=... every 2s.

CREATE TYPE "agent_run_status" AS ENUM ('running', 'done', 'error');

CREATE TABLE "agent_runs" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "type"            TEXT NOT NULL DEFAULT 'incorporate_feedback',
  "status"          "agent_run_status" NOT NULL DEFAULT 'running',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at"    TIMESTAMPTZ
);

CREATE TABLE "agent_run_events" (
  "id"         BIGSERIAL PRIMARY KEY,
  "run_id"     UUID NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  "seq"        INTEGER NOT NULL,
  "payload"    JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "agent_runs_org_idx"        ON "agent_runs"("organization_id");
CREATE INDEX "agent_run_events_run_idx"  ON "agent_run_events"("run_id", "seq");
