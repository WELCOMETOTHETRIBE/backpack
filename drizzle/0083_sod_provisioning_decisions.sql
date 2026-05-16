-- 0083 sod_provisioning_decisions — preventive-control decision log for
-- AC.L2-3.1.4 (Phase 3C).
--
-- One row per pre-flight call to /api/sod/provisioning-check. The
-- decision row IS the evidence — a "deny" row proves the matrix
-- prevented a Prohibited combination before it reached AD; an
-- "allow_with_attestation" row records when a Compensating-cell
-- combination was permitted. fail_open rows record when Codex was
-- consulted but couldn't return a decision (network blip, schema
-- mismatch, etc.) — the detective scan backstops those.
--
-- The principal + target_group fields are free-form because the
-- caller (the EnclaveWatch admin wrapper) names the identity in
-- whatever form AD recognizes (UPN, sAMAccountName, DN). Codex
-- doesn't normalize.
--
-- No idempotency constraint by design — every pre-flight call is its
-- own decision event. Repeated identical calls are individually
-- meaningful (an operator retrying after a denial, for example).

CREATE TABLE IF NOT EXISTS sod_provisioning_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Note: physical table name is "boundary" (singular).
  boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
  -- Identity the addition is proposed for.
  subject_principal text NOT NULL,
  -- AD/Entra group the addition targets (e.g. "MAC-Vault-SecAdmins").
  target_group text NOT NULL,
  -- Caller-provided snapshot of the principal's existing group memberships
  -- at request time. Used to evaluate the resulting role set.
  existing_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Resolved R-id role set if the addition were performed.
  resulting_role_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- "allow" | "allow_with_attestation" | "deny" | "fail_open"
  decision varchar(32) NOT NULL,
  -- Conflict pair that drove a non-allow decision, when applicable.
  conflict_pair_a varchar(8),
  conflict_pair_b varchar(8),
  /** Operational reason — free-form string surfaced in API response and UI. */
  reason text,
  -- Identity of the caller (operator who initiated the provisioning attempt).
  requested_by_principal text,
  -- Same auth-via marker we record on /api/sod/scan.
  triggered_via varchar(16) NOT NULL,
  -- For traceability with the EnclaveWatch wrapper's request id.
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sod_provisioning_decisions_org_decision_idx
  ON sod_provisioning_decisions (organization_id, decision, created_at DESC);

CREATE INDEX IF NOT EXISTS sod_provisioning_decisions_principal_idx
  ON sod_provisioning_decisions (organization_id, subject_principal, created_at DESC);
