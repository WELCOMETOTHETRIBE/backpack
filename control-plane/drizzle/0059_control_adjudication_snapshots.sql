-- Phase 7 — Control Adjudication Engine (CAE).
--
-- For every CMMC control, score the current state of operational evidence
-- against the control's register_requirements and emit a snapshot:
--
--    status     ∈ { satisfies, partial, gap, at_risk }
--    confidence ∈ [0, 1]
--    requirements_json   per-requirement pass/fail breakdown
--
-- Snapshots are timestamped and accumulate over time so the UI can show
-- a trend line ("3.1.5 status over the last 12 weeks"). Re-running the
-- scorer for the same (org, control, period_basis_manifest_id) replaces
-- the snapshot in place — the manifest_id is the natural idempotency key
-- because every refresh is anchored to a specific signed weekly export.

CREATE TABLE IF NOT EXISTS control_adjudication_snapshots (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id               varchar(20) NOT NULL,

    computed_at              timestamptz NOT NULL DEFAULT now(),

    -- The verdict.
    status                   varchar(16) NOT NULL,              -- satisfies | partial | gap | at_risk
    confidence               real NOT NULL,                     -- 0.0 - 1.0

    -- Per-requirement breakdown:
    --   [{ register_key, required_min, observed_final, observed_isso_verified,
    --      cadence_days_required, cadence_days_actual, satisfied, gap_reason,
    --      evidence_entry_ids: [up to 5] }, ...]
    requirements_json        jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- The manifest whose ingest triggered this snapshot. NULL when scored
    -- via a manual /api/.../adjudicate endpoint instead of an ingest hook.
    period_basis_manifest_id text,

    created_at               timestamptz NOT NULL DEFAULT now()
);

-- One row per (org, control, manifest). Re-scoring the same manifest is a
-- no-op replace.
CREATE UNIQUE INDEX IF NOT EXISTS control_adjudication_snapshots_org_control_manifest_idx
    ON control_adjudication_snapshots (
        organization_id, control_id, COALESCE(period_basis_manifest_id, '__manual__')
    );

-- Latest-per-control lookup.
CREATE INDEX IF NOT EXISTS control_adjudication_snapshots_org_control_recent_idx
    ON control_adjudication_snapshots (organization_id, control_id, computed_at DESC);

-- Trend lookup (all controls, recent snapshots).
CREATE INDEX IF NOT EXISTS control_adjudication_snapshots_org_recent_idx
    ON control_adjudication_snapshots (organization_id, computed_at DESC);
