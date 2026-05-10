-- ============================================================
-- SSP Baseline Drift Events (Phase 2 of "controlled baseline +
-- drift").
--
-- Once an SSP version is anchored as a controlled baseline (Phase 1,
-- migration 0075), the platform must observe whether current state
-- has drifted from the signed-and-released state — and classify how
-- much that drift matters for the SSP's defensibility.
--
-- This migration adds the per-finding event row. Detection runs on
-- demand (manual "Run Drift Check") or whenever upstream code wants
-- to surface drift. Each finding gets exactly one OPEN event per
-- (baseline, drift_type, source_record_id, control_id) tuple — the
-- dedup index below — so re-running detection is idempotent: existing
-- OPEN events are refreshed in place rather than piling up.
--
-- Severity:
--   minor    — log-only. Evidence refresh, scan timestamp moved, owner
--              display name changed; the SSP narrative is still
--              defensible against the change.
--   moderate — review required. Control finding wobbled (NOT_MET ↔
--              partial), POA&M opened/closed, evidence source added
--              or removed; an authorized reviewer should adjudicate.
--   material — SSP redraft trigger. Boundary components changed,
--              control regressed MET → NOT_MET, control flipped to
--              N/A; the released SSP no longer matches the system.
--
-- Routing flags (requires_*) are denormalized booleans for fast
-- queue queries on the drift adjudication UI; they're set by the
-- detection engine when it emits the event.
--
-- Lifecycle:
--   open         → just detected, awaiting adjudication.
--   acknowledged → reviewer has seen it but hasn't decided yet.
--   dismissed    → reviewer determined no SSP impact (rationale required).
--   resolved     → underlying drift was reverted, or a redraft baseline
--                  has superseded the controlled baseline.
--
-- Tenant isolation: organization_id on every row, matching the rest
-- of this module.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_baseline_drift_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  baseline_id uuid NOT NULL
    REFERENCES ssp_release_baselines(id) ON DELETE CASCADE,

  severity varchar(16) NOT NULL,
  drift_type varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'open',

  -- Provenance: which source row in which table moved. Both nullable
  -- because some drift types (e.g. "boundary component count
  -- changed in aggregate") don't pin to a single record.
  source_table varchar(64),
  source_record_id text,
  -- Denormalized for filter-by-control queries on the adjudication UI.
  control_id varchar(20),

  -- Pinned-vs-current. previous_* is what the baseline saw;
  -- current_* is what the world looks like now. Both nullable to
  -- accommodate add/remove deltas (current_* null on remove,
  -- previous_* null on add).
  previous_hash varchar(64),
  current_hash varchar(64),
  previous_value_json jsonb,
  current_value_json jsonb,

  summary text NOT NULL,
  recommendation text,

  -- Routing flags. Detection engine sets these per spec rules. They
  -- denormalize information already in (severity, drift_type) but
  -- letting the queue UI filter without joining to a rules table
  -- meaningfully simplifies the SQL.
  requires_ssp_redraft boolean NOT NULL DEFAULT false,
  requires_poam_review boolean NOT NULL DEFAULT false,
  requires_document_control_review boolean NOT NULL DEFAULT false,

  -- Detection cadence: detected_at moves on every detection pass that
  -- still finds the drift; first_detected_at is captured once and
  -- never moved. The pair gives the UI an "open for N days"
  -- indicator without losing the latest-observation timestamp.
  detected_at timestamptz NOT NULL DEFAULT now(),
  first_detected_at timestamptz NOT NULL DEFAULT now(),

  acknowledged_at timestamptz,
  acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  adjudicated_at timestamptz,
  adjudicated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Required when status flips to 'dismissed'; the spec mandates a
  -- rationale for dismissals so the audit trail explains why a
  -- material drift was deemed non-impacting. Enforced in service
  -- layer, not via a CHECK, so adjudication notes can be optional
  -- on acknowledge.
  adjudication_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ssp_baseline_drift_events_severity_chk
    CHECK (severity IN ('minor', 'moderate', 'material')),
  CONSTRAINT ssp_baseline_drift_events_status_chk
    CHECK (status IN ('open', 'acknowledged', 'dismissed', 'resolved'))
);

-- Idempotency anchor: at most one OPEN event per (baseline,
-- drift_type, source_record, control). Re-running detection refreshes
-- the existing row's detected_at + current_* fields rather than
-- inserting a duplicate. Once the event is acknowledged/dismissed/
-- resolved (status != 'open'), a NEW recurrence creates a new event
-- — adjudication closes a window, a fresh divergence opens a new one.
--
-- COALESCE on nullable fields: PG treats NULL as distinct in unique
-- indexes by default, so a literal NULL would slip past the dedup.
-- Folding to '' makes the dedup behave intuitively for events that
-- pin only to (baseline, drift_type) without a source record.
CREATE UNIQUE INDEX IF NOT EXISTS ssp_baseline_drift_events_dedup_idx
  ON ssp_baseline_drift_events (
    baseline_id,
    drift_type,
    COALESCE(source_record_id, ''),
    COALESCE(control_id, '')
  )
  WHERE status = 'open';

-- Queue queries: list open events for an org, filterable by severity.
CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_org_status_severity_idx
  ON ssp_baseline_drift_events (organization_id, status, severity);

-- Per-baseline drilldown.
CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_baseline_idx
  ON ssp_baseline_drift_events (baseline_id);

-- Per-control filtering on the adjudication UI.
CREATE INDEX IF NOT EXISTS ssp_baseline_drift_events_control_idx
  ON ssp_baseline_drift_events (organization_id, control_id)
  WHERE control_id IS NOT NULL;
