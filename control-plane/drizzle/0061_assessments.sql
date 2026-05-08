-- Phase 10 — Assessment session lifecycle.
--
-- During a C3PAO assessment the auditor walks the per-control auditor view
-- (/auditor/[controlId]). The OIS narrative + adjudication snapshot must
-- be FROZEN for the duration of the assessment so the auditor sees a
-- stable evidence picture they can adjudicate against.
--
-- An admin opens an assessment with assessment.opened_at; this fans out
-- and sets narrative_lock_started_at + narrative_lock_assessment_id on
-- every control_observed_implementations row. The OIS regenerator then
-- skips locked rows on subsequent ingests.
--
-- The auditor can write notes via the assessor scratchpad — captured per
-- (assessment, control) in the assessor_scratchpads table. At assessment
-- close, all scratchpads are signed and the assessment receipt becomes a
-- tamper-evident bundle.

CREATE TABLE IF NOT EXISTS assessments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Free text identifying the assessment (e.g., "MacTech 2026Q2 C3PAO").
    title               text NOT NULL,

    -- Assessment lifecycle state.
    status              varchar(16) NOT NULL DEFAULT 'open',  -- open | closed | abandoned

    -- Open / close metadata.
    opened_at           timestamptz NOT NULL DEFAULT now(),
    opened_by_user_id   uuid REFERENCES users(id),
    closed_at           timestamptz,
    closed_by_user_id   uuid REFERENCES users(id),

    -- Assessor identity (the C3PAO).
    assessor_name       text,
    assessor_org        text,
    assessor_email      text,

    -- Sign-off summary added at close. Free text.
    closeout_summary    text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessments_org_status_idx
    ON assessments (organization_id, status, opened_at DESC);

-- Per-(assessment, control) assessor notes. Autosaves from the auditor view.
CREATE TABLE IF NOT EXISTS assessor_scratchpads (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id       uuid NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id          varchar(20) NOT NULL,

    notes               text NOT NULL DEFAULT '',
    -- Assessor's recommended verdict for the control. Independent of the
    -- engine's CAE verdict — this is the auditor's professional opinion
    -- after walking the evidence.
    assessor_verdict    varchar(24),  -- satisfies | partial | gap | not_applicable | NULL

    last_edited_at      timestamptz NOT NULL DEFAULT now(),
    last_edited_by_user_id uuid REFERENCES users(id),

    created_at          timestamptz NOT NULL DEFAULT now()
);

-- One scratchpad per (assessment, control). Autosave path upserts here.
CREATE UNIQUE INDEX IF NOT EXISTS assessor_scratchpads_assessment_control_idx
    ON assessor_scratchpads (assessment_id, control_id);
