-- RA.L2-3.11.1 — annual risk assessment lifecycle envelope.
--
-- WHY THIS EXISTS
-- The customer's risks today live in governance_register_entries with
-- registerKey='risk_register' and entryData.assessment_id grouping. There
-- is no first-class envelope row carrying the assessment's lifecycle
-- (draft → reviewed → approved → finalized), the C3PAO objective-level
-- statuses ([a] frequency defined, [b] assessment performed), the bundle
-- fingerprint at finalization time, or a vault pointer for the case
-- where the bundle bytes live outside Codex.
--
-- This migration adds that envelope, plus a first-class table for
-- executive risk acceptances (the "skip POA&M" path under CMMC) and a
-- linkage table from a specific risk's external id to a POA&M entry.
--
-- DATA BOUNDARY
-- These tables hold only sanitized metadata, status, hashes, role-level
-- owner names, and vault pointers. Raw risk narratives, vulnerability
-- detail, network topology, etc. continue to live in
-- governance_register_entries.entryData (and, in production deployments,
-- in the vault byte store referenced by vault_artifact_pointer).

-- ============================================================
-- risk_assessments — one row per annual cycle / boundary.
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_assessments (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    boundary_id                 uuid NOT NULL REFERENCES boundary(id) ON DELETE RESTRICT,

    -- Pivot key shared with governance_register_entries.entryData.assessment_id.
    -- Lets the bundle endpoint and risk register find each other without a
    -- hard FK across schema boundaries.
    assessment_pivot_id         uuid NOT NULL UNIQUE,

    control_id                  varchar(20) NOT NULL DEFAULT '3.11.1',
    source_app                  varchar(32) NOT NULL DEFAULT 'training_readiness',  -- training_readiness | wizard | external_upload

    -- Identity / scope.
    assessment_name             text,
    organization_name           text,
    system_name                 text,
    scope_type                  varchar(16) NOT NULL DEFAULT 'enclave',  -- enterprise | enclave | system
    methodology                 text NOT NULL DEFAULT 'NIST SP 800-30 Rev. 1 / CMMC Level 2',

    -- Cadence — objective [a] (frequency defined; <= 365 days).
    defined_frequency_days      integer,
    review_period_start         date,
    review_period_end           date,
    next_due_date               date,

    -- Lifecycle status.
    --   not_started — envelope created but wizard not yet completed
    --   draft — submit endpoint has fired but reviewer has not signed off
    --   in_progress — explicitly opened by an assessor
    --   ready_for_review — submitter handed off
    --   reviewed — reviewer signed off
    --   ready_for_approval — reviewer handed off
    --   approved — approver signed off
    --   finalized — locked / immutable; produces evidence
    --   superseded — a newer finalized assessment replaces this one
    --   overdue — next_due_date passed without a fresh finalization
    status                      varchar(24) NOT NULL DEFAULT 'draft',

    -- Objective-level statuses (CMMC RA.L2-3.11.1[a] / [b]).
    objective_a_status          varchar(16) NOT NULL DEFAULT 'unknown',  -- met | not_met | not_applicable | unknown
    objective_a_rationale       text,
    objective_b_status          varchar(16) NOT NULL DEFAULT 'unknown',
    objective_b_rationale       text,

    -- Sign-off chain — names captured for audit, plus FK user IDs when
    -- the reviewer/approver is a tenant user (rather than an external
    -- third party such as a vCISO whose signature is name-only).
    assessor_display_name       text,
    reviewer_display_name       text,
    approver_display_name       text,
    submitted_by_user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    approved_by_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,

    submitted_at                timestamptz,
    reviewed_at                 timestamptz,
    approved_at                 timestamptz,
    finalized_at                timestamptz,
    superseded_at               timestamptz,
    superseded_by_assessment_id uuid REFERENCES risk_assessments(id) ON DELETE SET NULL,

    -- Hashes captured at finalization.
    final_report_sha256         varchar(64),
    package_sha256              varchar(64),
    evidence_manifest_sha256    varchar(64),

    -- Vault pointers (production deployments). Null in local-pilot mode
    -- where the bundle is generated on demand from /api/risk-assessment
    -- /bundle/[id] and the bytes don't live in a vault yet.
    vault_artifact_pointer      text,
    immutable_manifest_pointer  text,

    -- Schema version of the envelope itself, for forward migration.
    metadata_version            integer NOT NULL DEFAULT 1,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    -- Status sanity.
    CONSTRAINT risk_assessments_status_chk CHECK (status IN (
        'not_started', 'draft', 'in_progress', 'ready_for_review',
        'reviewed', 'ready_for_approval', 'approved',
        'finalized', 'superseded', 'overdue'
    )),
    CONSTRAINT risk_assessments_obj_a_chk CHECK (objective_a_status IN
        ('met', 'not_met', 'not_applicable', 'unknown')),
    CONSTRAINT risk_assessments_obj_b_chk CHECK (objective_b_status IN
        ('met', 'not_met', 'not_applicable', 'unknown')),
    CONSTRAINT risk_assessments_freq_lte_year_chk
        CHECK (defined_frequency_days IS NULL OR defined_frequency_days <= 366),

    -- Finalization invariants — ALL or NONE of the finalization markers.
    -- Once status = 'finalized', the hash + sign-off + period must exist.
    -- Application code provides the actual immutability guard; this is the
    -- last-line schema-level check.
    CONSTRAINT risk_assessments_finalized_complete_chk CHECK (
        status <> 'finalized' OR (
            finalized_at            IS NOT NULL AND
            final_report_sha256     IS NOT NULL AND
            package_sha256          IS NOT NULL AND
            review_period_start     IS NOT NULL AND
            review_period_end       IS NOT NULL AND
            objective_a_status IN ('met', 'not_applicable') AND
            objective_b_status IN ('met', 'not_applicable')
        )
    )
);

CREATE INDEX IF NOT EXISTS risk_assessments_org_status_idx
    ON risk_assessments (organization_id, status, finalized_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS risk_assessments_org_due_idx
    ON risk_assessments (organization_id, next_due_date);

CREATE INDEX IF NOT EXISTS risk_assessments_pivot_idx
    ON risk_assessments (assessment_pivot_id);

-- ============================================================
-- risk_acceptances — one row per executive risk acceptance.
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_acceptances (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    risk_assessment_id            uuid NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,

    -- The risk's external id from the wizard (matches
    -- governance_register_entries.entryData.risk_id).
    risk_external_id              varchar(64) NOT NULL,

    severity                      varchar(16) NOT NULL,            -- low | medium | high | critical
    residual_risk                 varchar(16) NOT NULL,            -- low | medium | high | critical (after acceptance)

    -- Sanitized rationale only — no full risk narrative; full text lives
    -- in governance_register_entries.entryData and (in vault deployments)
    -- in the vault.
    acceptance_rationale_summary  text NOT NULL,

    approver_user_id              uuid REFERENCES users(id) ON DELETE SET NULL,
    approver_display_name         text NOT NULL,
    approver_role                 varchar(64),                     -- captured at approval time

    approved_at                   timestamptz NOT NULL DEFAULT now(),
    next_review_date              date NOT NULL,

    -- Pointers / hashes.
    vault_pointer                 text,
    acceptance_record_hash        varchar(64),

    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT risk_acceptances_severity_chk CHECK
        (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT risk_acceptances_residual_chk CHECK
        (residual_risk IN ('low', 'medium', 'high', 'critical'))
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_acceptances_assessment_risk_idx
    ON risk_acceptances (risk_assessment_id, risk_external_id);

CREATE INDEX IF NOT EXISTS risk_acceptances_org_severity_idx
    ON risk_acceptances (organization_id, severity);

-- ============================================================
-- risk_poam_links — one row per (risk_external_id, poam) edge.
-- Different risks can target the same POA&M; one risk can have at most
-- one active link (older links can be marked inactive via deletion +
-- audit-log entry, preserving history).
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_poam_links (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    risk_assessment_id  uuid NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
    risk_external_id    varchar(64) NOT NULL,

    -- One of poam_entry_id (canonical) or poam_external_ref (when the
    -- POA&M lives in an external GRC tool and we just hold a reference).
    poam_entry_id       uuid REFERENCES poam_entries(id) ON DELETE SET NULL,
    poam_external_ref   text,
    poam_source         varchar(16) NOT NULL DEFAULT 'control_plane',  -- control_plane | vault | external

    -- Sanitized snapshot at link time. Full POA&M lives in poam_entries
    -- (or in the external system). These fields are for the dashboard
    -- card so we don't have to chase the FK on every render.
    sanitized_title     text,
    severity            varchar(16),
    owner_role          varchar(64),
    due_date            date,

    vault_pointer       text,
    link_hash           varchar(64),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT risk_poam_links_one_target_chk CHECK (
        (poam_entry_id IS NOT NULL)::int + (poam_external_ref IS NOT NULL)::int = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_poam_links_assessment_risk_idx
    ON risk_poam_links (risk_assessment_id, risk_external_id);

CREATE INDEX IF NOT EXISTS risk_poam_links_org_idx
    ON risk_poam_links (organization_id);

-- ============================================================
-- updated_at triggers — match the project convention used by
-- governance_register_entries / poam_entries.
-- ============================================================
CREATE OR REPLACE FUNCTION risk_assessment_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_assessments_set_updated_at ON risk_assessments;
CREATE TRIGGER risk_assessments_set_updated_at
    BEFORE UPDATE ON risk_assessments
    FOR EACH ROW EXECUTE FUNCTION risk_assessment_set_updated_at();

DROP TRIGGER IF EXISTS risk_acceptances_set_updated_at ON risk_acceptances;
CREATE TRIGGER risk_acceptances_set_updated_at
    BEFORE UPDATE ON risk_acceptances
    FOR EACH ROW EXECUTE FUNCTION risk_assessment_set_updated_at();

DROP TRIGGER IF EXISTS risk_poam_links_set_updated_at ON risk_poam_links;
CREATE TRIGGER risk_poam_links_set_updated_at
    BEFORE UPDATE ON risk_poam_links
    FOR EACH ROW EXECUTE FUNCTION risk_assessment_set_updated_at();
