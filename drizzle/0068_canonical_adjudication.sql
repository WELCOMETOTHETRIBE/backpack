-- Phase A0 — canonical-source unification.
--
-- This migration is the foundation for the SSP rebuild. It does NOT
-- migrate any read surface yet; that's Phase A1. It does NOT add
-- rescore triggers; that's Phase B. It JUST makes the data shape
-- ready for everything else.
--
-- WHY THIS EXISTS
-- The customer's gut-check this week (the May 4 risk-assessment
-- attestation flip, the duplicate IR rows on the SCTM, the empty CAE
-- page) all traced to one root cause: no single canonical source of
-- truth for control adjudication. Two parallel scoring systems
-- (isControlAdjudicated vs scoreControl) plus four UI surfaces
-- bypassing the canonical helper and reading raw status. Plus the
-- assessment-guide-required vocabulary (MET / NOT MET / N/A at the
-- *objective* level) wasn't represented at all.
--
-- This migration:
--   1. Extends control_adjudication_snapshots with per-objective
--      MET/NOT MET/N/A verdicts and the four AG-recognized MET-
--      elevators (enduring exception, operational plan of action,
--      DoD CIO adjudication, ESP inheritance).
--   2. Adds control_status_overrides — operator-driven overrides on
--      the bin-1-5 status, with reason + user + expiry. The legacy
--      control_records.implementation_status column becomes a derived
--      projection of (CAE rollup) + (override).
--   3. Adds enduring_exceptions and dod_cio_adjudications tables for
--      the MET-elevators that need persistent first-class records.
--   4. Adds ssp_signoffs to capture Authorizing Official sign-off on
--      generated SSP versions (Posture A+ from the plan: Codex signs
--      content, AO countersigns the same data_hash).
--   5. Extends poam_entries with the three AG-mandated fields that
--      let a POA&M elevate a NOT MET to MET per AG p.10:
--      deficiency_review_summary, progress_summary, original target
--      date + push counter for chronic-slippage detection.
--   6. Extends poam_entry_status with 'draft' and 'active' so auto-
--      created stub POA&Ms (status='draft') do NOT yet count as the
--      elevator; only customer-finalized 'active' POA&Ms do.
--
-- All changes are additive. No existing read surface breaks.
-- Migration of read surfaces happens in Phase A1.

-- ============================================================
-- 1. control_adjudication_snapshots — per-objective verdicts +
--    four MET-elevators.
-- ============================================================

ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS objective_verdicts jsonb NOT NULL DEFAULT '[]'::jsonb;
-- shape:
--   [{ "objective": "a",
--      "verdict": "MET" | "NOT_MET" | "NA",
--      "evidence_ids": ["uuid", ...],
--      "rationale": "..." (free text, may be null) }, ...]
-- The CAE scorer (scoreControl) computes this on each rescore.

ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS met_via varchar(40) NOT NULL DEFAULT 'evidence';
-- Allowed: evidence | enduring_exception | operational_plan_of_action |
--          dod_cio_adjudication | esp_inheritance | not_met | not_applicable
-- Computed on rescore. NOT MET = no elevator is active. NOT APPLICABLE
-- = operator-declared via control_status_overrides with rationale.

ALTER TABLE control_adjudication_snapshots
  ADD CONSTRAINT control_adjudication_snapshots_met_via_chk
  CHECK (met_via IN (
    'evidence', 'enduring_exception', 'operational_plan_of_action',
    'dod_cio_adjudication', 'esp_inheritance', 'not_met', 'not_applicable'
  ));

ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS aggregate_finding varchar(16);
-- Computed: 'MET' | 'NOT_MET' | 'NA'. One NOT MET objective fails the
-- entire requirement [AG p.10]. Stored so SCTM/dashboards/SSP all
-- read the same precomputed answer.

ALTER TABLE control_adjudication_snapshots
  ADD CONSTRAINT control_adjudication_snapshots_aggregate_finding_chk
  CHECK (aggregate_finding IS NULL
      OR aggregate_finding IN ('MET', 'NOT_MET', 'NA'));

-- Pointers to the four MET-elevators. NULL = not invoked. Multiple
-- can be set (e.g., ESP inheritance for some objectives + an
-- operational plan for others), in which case the rollup combines.
ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS enduring_exception_id uuid;

ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS operational_plan_poam_id uuid
    REFERENCES poam_entries(id) ON DELETE SET NULL;

ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS dod_cio_adjudication_id uuid;

-- ESP inheritance is recorded as a JSONB pointer set rather than a
-- new table because the existing org-level "external_service_providers"
-- jsonb on organizations already carries the ESP catalog. We just
-- record which ESP + which objectives.
ALTER TABLE control_adjudication_snapshots
  ADD COLUMN IF NOT EXISTS esp_inheritance jsonb;
-- shape: { "provider_name": "...", "kind": "csp"|"msp"|"mssp"|"caas",
--          "objectives": ["a","b"], "evidence_ref": "..." }

CREATE INDEX IF NOT EXISTS control_adjudication_snapshots_aggregate_idx
  ON control_adjudication_snapshots (organization_id, aggregate_finding);

-- ============================================================
-- 2. control_status_overrides — operator-driven status overrides.
--    The bin-1-5 status (implemented/inherited/not_applicable/
--    outstanding) the dashboard renders is normally derived from the
--    CAE rollup. An override lets an operator pin a specific status
--    with reason + user + expiry. The override is rendered in the UI
--    visibly distinct from a derived verdict so a C3PAO never
--    mistakes one for the other.
-- ============================================================

CREATE TABLE IF NOT EXISTS control_status_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id          varchar(20) NOT NULL,
  override_status     varchar(24) NOT NULL,
                          -- allowed: implemented | inherited | not_applicable | outstanding
  reason              text NOT NULL,
                          -- non-empty per CHECK below; the auditor reads this
  set_by_user_id      uuid NOT NULL REFERENCES users(id),
  set_at              timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,
                          -- null = no auto-expiry (operator must revoke)
  revoked_at          timestamptz,
  revoked_by_user_id  uuid REFERENCES users(id),
  revoked_reason      text,
  CONSTRAINT control_status_overrides_status_chk
    CHECK (override_status IN ('implemented', 'inherited', 'not_applicable', 'outstanding')),
  CONSTRAINT control_status_overrides_reason_nonempty_chk
    CHECK (length(trim(reason)) >= 8)
);

-- One active override per (org, control) at a time. Re-pinning revokes
-- the prior row.
CREATE UNIQUE INDEX IF NOT EXISTS control_status_overrides_active_unique
  ON control_status_overrides (organization_id, control_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS control_status_overrides_org_idx
  ON control_status_overrides (organization_id);

-- ============================================================
-- 3. enduring_exceptions — first-class for AG p.10 elevator.
--    "Enduring Exceptions when described, along with any mitigations,
--    in the system security plan shall be assessed as MET."
-- ============================================================

CREATE TABLE IF NOT EXISTS enduring_exceptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id          varchar(20) NOT NULL,
  applies_to_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
                          -- ["a", "b"] — letter list. Empty = whole control.
  description         text NOT NULL,
                          -- what the exception is and why
  mitigations         text NOT NULL,
                          -- what compensating controls / processes apply
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at         timestamptz,
                          -- both null until the AO signs off
  superseded_at       timestamptz,
  superseded_by_id    uuid REFERENCES enduring_exceptions(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enduring_exceptions_description_nonempty_chk
    CHECK (length(trim(description)) >= 20),
  CONSTRAINT enduring_exceptions_mitigations_nonempty_chk
    CHECK (length(trim(mitigations)) >= 20)
);

CREATE INDEX IF NOT EXISTS enduring_exceptions_org_control_idx
  ON enduring_exceptions (organization_id, control_id)
  WHERE superseded_at IS NULL;

-- Wire the FK on control_adjudication_snapshots now that the table exists.
ALTER TABLE control_adjudication_snapshots
  ADD CONSTRAINT control_adjudication_snapshots_enduring_exception_fk
  FOREIGN KEY (enduring_exception_id) REFERENCES enduring_exceptions(id)
  ON DELETE SET NULL;

-- ============================================================
-- 4. dod_cio_adjudications — first-class for AG p.10 elevator.
--    "If an OSC previously received a favorable adjudication from the
--    DoD CIO indicating that … an alternative security measure is
--    equally effective, the DoD CIO adjudication must be included in
--    the system security plan to receive consideration during an
--    assessment. Implemented security measures adjudicated by the DoD
--    CIO as equally effective are assessed as MET if there have been
--    no changes in the environment."
-- ============================================================

CREATE TABLE IF NOT EXISTS dod_cio_adjudications (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id               varchar(20) NOT NULL,
  applies_to_objectives    jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference                text NOT NULL,
                          -- DoD CIO letter / case # / URL
  summary                  text NOT NULL,
                          -- what alternative measure was adjudicated
  issued_at                date NOT NULL,
  environment_unchanged_attestation_id uuid,
                          -- ssp_signoffs row attesting "no environmental
                          -- changes since adjudication"; required for
                          -- continued MET per AG p.10
  superseded_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dod_cio_adjudications_reference_nonempty_chk
    CHECK (length(trim(reference)) >= 4),
  CONSTRAINT dod_cio_adjudications_summary_nonempty_chk
    CHECK (length(trim(summary)) >= 20)
);

CREATE INDEX IF NOT EXISTS dod_cio_adjudications_org_control_idx
  ON dod_cio_adjudications (organization_id, control_id)
  WHERE superseded_at IS NULL;

ALTER TABLE control_adjudication_snapshots
  ADD CONSTRAINT control_adjudication_snapshots_dod_cio_fk
  FOREIGN KEY (dod_cio_adjudication_id) REFERENCES dod_cio_adjudications(id)
  ON DELETE SET NULL;

-- ============================================================
-- 5. ssp_signoffs — Authorizing Official countersignature on a
--    generated SSP version. Posture A+ from §0.3:
--      Codex signs the SSP content with its key (binding evidence
--      to document version);
--      the AO sign-off is a separate row carrying name + title +
--      date + the same data_hash Codex signed, so the AO is
--      bound to identical content.
--    Pre-creates the ssp_documents FK as nullable for now; we'll
--    populate ssp_documents in Phase C and back-fill the constraint.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_signoffs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ssp_document_id          uuid,
                          -- FK back-filled in Phase C when ssp_documents lands
  signoff_kind             varchar(32) NOT NULL,
                          -- 'authorizing_official' | 'system_owner' | 'isso'
                          -- | 'environment_unchanged' (for DoD CIO continuation)
  signer_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  signer_display_name      text NOT NULL,
  signer_title             text NOT NULL,
  data_hash                varchar(64) NOT NULL,
                          -- the SHA-256 the signer is bound to;
                          -- equals ssp_documents.payload_sha256
  signed_at                timestamptz NOT NULL DEFAULT now(),
  signature_alg            varchar(32),
                          -- 'attestation_only' if no crypto key (Posture A+)
                          -- 'ed25519' / 'rs256' if real customer key (option C)
  signature_value          text,
                          -- present only when signature_alg != attestation_only
  comment                  text,
  CONSTRAINT ssp_signoffs_kind_chk
    CHECK (signoff_kind IN ('authorizing_official', 'system_owner', 'isso',
                            'environment_unchanged')),
  CONSTRAINT ssp_signoffs_signer_name_nonempty_chk
    CHECK (length(trim(signer_display_name)) >= 2),
  CONSTRAINT ssp_signoffs_signer_title_nonempty_chk
    CHECK (length(trim(signer_title)) >= 2),
  CONSTRAINT ssp_signoffs_data_hash_format_chk
    CHECK (data_hash ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS ssp_signoffs_org_ssp_idx
  ON ssp_signoffs (organization_id, ssp_document_id);

CREATE INDEX IF NOT EXISTS ssp_signoffs_data_hash_idx
  ON ssp_signoffs (data_hash);

-- Wire dod_cio_adjudications.environment_unchanged_attestation_id now.
ALTER TABLE dod_cio_adjudications
  ADD CONSTRAINT dod_cio_adjudications_environment_unchanged_fk
  FOREIGN KEY (environment_unchanged_attestation_id) REFERENCES ssp_signoffs(id)
  ON DELETE SET NULL;

-- ============================================================
-- 6. poam_entries — extend with AG-compliance fields.
--    AG p.10: a temporary deficiency counts as MET when the POA&M
--    "include[s] deficiency reviews, milestones, and show progress
--    towards the implementation of corrections."
--
--    Today's poam_entries has weakness_description + remediation_plan
--    + scheduled_completion_date + closeout_evidence — close to AG's
--    requirements but missing the explicit "deficiency review" and
--    "progress" fields, plus chronic-slippage detection.
-- ============================================================

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS deficiency_review_summary text;
-- AG-mandated. The "review" content: what's missing, why, and how it
-- was identified. Must be present for the POA&M to count as MET-via-
-- operational-plan-of-action.

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS progress_summary text;
-- AG-mandated. What's been done so far. Updated on rescore.

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS original_completion_date date;
-- Captured at finalize time. The "scheduled" date can shift; the
-- "original" doesn't. Powers chronic-slippage detection.

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS target_pushed_count integer NOT NULL DEFAULT 0;
-- Increments every time scheduled_completion_date moves forward.
-- If > 2, the POA&M no longer counts as a "temporary deficiency"
-- per AG p.10 (the elevator stops applying).

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
-- Set when status flips from 'draft' to 'active'. Auto-created stub
-- POA&Ms are draft until the customer fills the AG-mandated fields
-- and finalizes — only then do they elevate the verdict.

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS auto_created_for_objective varchar(8);
-- When the rescore creates a stub POA&M for a NOT MET objective,
-- this records which objective letter triggered the auto-create.
-- Null on customer-authored POA&Ms.

ALTER TABLE poam_entries
  ADD COLUMN IF NOT EXISTS auto_created_at timestamptz;
-- Distinguishes auto-created POA&Ms from customer-created ones.

-- Extend the poam_entry_status enum with 'draft' and 'active'.
-- 'open' stays for back-compat but new code uses draft → active → closed.
ALTER TYPE poam_entry_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE poam_entry_status ADD VALUE IF NOT EXISTS 'active';

-- ============================================================
-- 7. Audit-log convenience: snapshot transitions.
--    Every rescore writes one row here so the SSP's per-control
--    audit trail can be reconstructed deterministically.
-- ============================================================

CREATE TABLE IF NOT EXISTS control_adjudication_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id          varchar(20) NOT NULL,
  snapshot_id         uuid REFERENCES control_adjudication_snapshots(id) ON DELETE SET NULL,
  prior_aggregate_finding varchar(16),
  new_aggregate_finding   varchar(16),
  prior_met_via       varchar(40),
  new_met_via         varchar(40),
  prior_objective_verdicts jsonb,
  new_objective_verdicts   jsonb,
  trigger_source      varchar(64) NOT NULL,
                          -- e.g., 'attestation_signed' | 'register_entry_finalized'
                          -- | 'ra_finalized' | 'poam_finalized' | 'manual_override'
                          -- | 'ir_bundle_archived' | 'qms_manifest_ingested'
                          -- | 'isso_export_ingested' | 'validator_run_persisted'
                          -- | 'on_read_stale_recompute'
  triggered_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  triggered_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS control_adjudication_history_org_control_time_idx
  ON control_adjudication_history (organization_id, control_id, triggered_at DESC);
