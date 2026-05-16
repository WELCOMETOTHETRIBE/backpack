-- 0081 sod_findings — detective-scan output for AC.L2-3.1.4 Separation of Duties.
--
-- One row per (organization, principal, conflicting role pair). The detective
-- scan ingests an AD/Entra group-membership export, evaluates each principal's
-- role set against the SoD matrix (MAC-SOP-235), and opens a finding per
-- Prohibited pair held simultaneously, or per Compensating pair lacking a
-- current quarterly attestation.
--
-- Idempotency: the partial unique index on (org, principal, pair_role_a,
-- pair_role_b) WHERE status='open' guarantees re-running the same scan does
-- not duplicate open findings. Closed findings accumulate as history; if the
-- same conflict reappears after close, a new open row is created.
--
-- Pair normalization: pair_role_a / pair_role_b are stored in numeric R-id
-- order (R1 < R2 < R10) so (R1,R8) and (R8,R1) collapse to one row. The
-- scan-side helper sorts before insert.

CREATE TABLE IF NOT EXISTS sod_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Note: actual SQL table name is "boundary" (singular), not "boundaries".
  -- Drizzle TS variable name diverges from physical table name; migration
  -- 0015 created "boundary".
  boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
  subject_principal text NOT NULL,
  role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  pair_role_a varchar(8) NOT NULL,
  pair_role_b varchar(8) NOT NULL,
  disposition_type varchar(32) NOT NULL,
  severity varchar(16) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by_id uuid REFERENCES users(id),
  justification_text text,
  source_scan_run_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sod_findings_open_unique
  ON sod_findings (organization_id, subject_principal, pair_role_a, pair_role_b)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS sod_findings_org_status_idx
  ON sod_findings (organization_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS sod_findings_principal_idx
  ON sod_findings (organization_id, subject_principal);
