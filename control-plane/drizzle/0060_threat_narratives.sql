-- Phase 9 — Cross-evidence threat-narrative correlation.
--
-- Detects when multiple register entries tell a single threat story (e.g.,
-- break-glass sign-in + privileged grant + Defender alert from same actor
-- in same hour = "credential compromise narrative") and records the
-- joined narrative as its own auditor-defensible artifact.
--
-- Each narrative is a Pattern A loop in itself: detected by the
-- correlation engine, admin signs investigation outcome, ISSO verifies
-- on weekly review.
--
-- The contributing entries' ids are persisted as a JSONB array so the
-- detail UI can fan out to each entry.

CREATE TABLE IF NOT EXISTS threat_narratives (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Type of narrative — drives the rule that fired and the response
    -- checklist shown to the admin.
    narrative_type           varchar(80) NOT NULL,

    -- Free-text auto-generated summary of the joined story. Composed by
    -- the threat-narrative service from a per-rule template.
    summary                  text NOT NULL,

    confidence               real NOT NULL,

    -- The contributing entries: [{ entry_id, register_key, entry_type,
    --   contribution: "lead" | "supporting" }, …]. Lead entry is the
    -- narrative's anchor (typically the highest-severity event); the rest
    -- are supporting context.
    related_entry_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- When the first contributing entry was observed.
    opened_at                timestamptz NOT NULL,

    -- When the most recent contributing entry was observed. Updated as
    -- the correlator joins additional entries to the narrative.
    last_observed_at         timestamptz NOT NULL,

    -- Pattern A lifecycle:
    --   open                 — correlator detected it; no admin action yet
    --   admin_investigating  — admin has acknowledged + opened investigation
    --   admin_resolved       — admin documented outcome
    --   isso_verified        — ISSO signed off on next weekly review
    --   false_positive       — admin marked false positive
    --   merged_into          — duplicates rolled up into another narrative
    status                   varchar(24) NOT NULL DEFAULT 'open',

    -- Investigation fields (populated by admin when they acknowledge).
    admin_acknowledged_at    timestamptz,
    admin_acknowledged_by    uuid,
    admin_outcome            text,            -- true_positive_remediated / false_positive / etc.
    admin_notes              text,

    -- ISSO verification fields (populated on next weekly review).
    isso_verified_at         timestamptz,
    isso_verified_by_name    text,
    isso_note                text,

    -- When status = 'merged_into', the parent narrative.
    merged_into_id           uuid REFERENCES threat_narratives(id) ON DELETE SET NULL,

    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS threat_narratives_org_status_idx
    ON threat_narratives (organization_id, status, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS threat_narratives_org_recent_idx
    ON threat_narratives (organization_id, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS threat_narratives_type_idx
    ON threat_narratives (organization_id, narrative_type, last_observed_at DESC);
