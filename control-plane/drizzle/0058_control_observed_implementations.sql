-- Phase 6 — Control Adjudication Ecosystem §2: Observed-Implementation
-- Statements (OIS).
--
-- Every CMMC control gets a continuously-updated, auto-generated narrative
-- describing how the organization implements the control AS OBSERVED from
-- recent register entries. Replaces the static SSP implementation
-- statement with a derived, reproducible one. Refreshed on every ISSO
-- weekly export ingest so the latest signed manifest's evidence drives
-- the live narrative.
--
-- Key insight: control_assessment_logic.v1.json already declares each
-- control's register_requirements (which registers + cadence). The OIS
-- generator counts entries per (register_key, entry_type, lifecycle_state)
-- in the period and renders a per-control template against those counts.
--
-- The narrative_lock field freezes the row during an open assessment so
-- a C3PAO doesn't see the narrative shift mid-walkthrough. Lock is
-- explicit (admin sets it from the Phase 10 Auditor View page) and
-- captures the exact manifest_id whose evidence the locked narrative
-- describes.

CREATE TABLE IF NOT EXISTS control_observed_implementations (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id               varchar(20) NOT NULL,

    -- Period this narrative summarizes. Anchored to the manifest's review
    -- window so the narrative is reproducibly tied to a signed export.
    period_start             timestamptz NOT NULL,
    period_end               timestamptz NOT NULL,

    -- The auto-generated paragraph. Composed from a per-control template
    -- in src/data/cmmc/control_implementation_templates.v1.json + observed
    -- counts. ~200-1000 chars typical.
    narrative                text NOT NULL,

    -- Per-(register_key, entry_type, lifecycle_state) counts that drove
    -- the narrative. Lets the UI show the breakdown next to the prose:
    --   { "access_authorization": {
    --       "privileged_grant_acknowledgment": {
    --         "isso_verified": 14, "admin_signed": 0, "draft": 0
    --       },
    --       "weekly_review_finding": { "auto_recorded": 3 }
    --     },
    --     ...
    --   }
    evidence_summary         jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Provenance: which manifest's ingest triggered this generation.
    -- Replaces hand-authored SSPs with content-hash-traceable narratives.
    generated_at             timestamptz NOT NULL DEFAULT now(),
    generated_from_manifest_id text,

    -- Freshness: most recent (lifecycle_state ∈ admin_signed | isso_verified)
    -- entry across the control's register_requirements. Drives at-risk
    -- detection in Phase 8 — a control whose freshest evidence is weeks
    -- past its cadence is at-risk regardless of narrative.
    most_recent_evidence_at  timestamptz,

    -- Assessment lock. When narrative_lock_started_at IS NOT NULL the row
    -- is frozen — re-generation skips it until the lock is cleared. Used
    -- by Phase 10 Auditor View to give the C3PAO a stable narrative to
    -- adjudicate against.
    narrative_lock_started_at timestamptz,
    narrative_lock_assessment_id uuid,  -- FK to assessments table (Phase 10)

    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

-- One row per (org, control_id, period_end). Re-running generation for
-- the same period replaces the row in place.
CREATE UNIQUE INDEX IF NOT EXISTS control_observed_implementations_org_control_period_idx
    ON control_observed_implementations (organization_id, control_id, period_end);

-- Per-control timeline lookup (latest first) for the per-control detail
-- page's "history of implementation statements" panel.
CREATE INDEX IF NOT EXISTS control_observed_implementations_org_control_recent_idx
    ON control_observed_implementations (organization_id, control_id, period_end DESC);

-- Locked rows lookup for assessment in progress.
CREATE INDEX IF NOT EXISTS control_observed_implementations_locked_idx
    ON control_observed_implementations (organization_id, narrative_lock_assessment_id)
    WHERE narrative_lock_started_at IS NOT NULL;
