-- 0082 r10_break_glass_activations — incident-responder PIM break-glass audit
-- register for AC.L2-3.1.4 (Phase 3A).
--
-- One row per Entra PIM activation that elevates an identity into the
-- R10 (MAC-Vault-IR) administrative group. EnclaveWatch posts these on
-- a cadence to /api/enclavewatch/r10-break-glass/activations. Each row
-- starts as `pending_review` and must be transitioned to `reviewed` by
-- a non-activator within the SLA window (24h per MAC-SOP-235 §5.3).
--
-- Idempotency: unique index on (org, external_activation_id) so the
-- enclave-side collector can safely re-post any rolling-window export.
--
-- The reviewer != activator constraint is enforced at the API layer,
-- not in DB — the activator field is a free-form identity string
-- (UPN / sAMAccountName from the enclave's collector); the reviewer is
-- a Codex user. They live in different identity spaces.

CREATE TABLE IF NOT EXISTS r10_break_glass_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Note: physical table name is "boundary" (singular).
  boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE CASCADE,
  -- Stable identifier from the activation source (Entra PIM request id, or
  -- a synthesized id from the collector). Drives idempotency.
  external_activation_id text NOT NULL,
  -- The identity that activated (UPN / SamAccountName as exported by the
  -- enclave-side collector). Free-form string — the same identity space
  -- as sod_findings.subject_principal.
  activator_principal text NOT NULL,
  -- Role activated. Almost always "MAC-Vault-IR" / "R10" but stored
  -- generically so we can extend to other JIT roles later without a
  -- schema bump.
  activated_role text NOT NULL,
  activation_started_at timestamptz NOT NULL,
  -- When the activation expired or will expire (PIM is always time-boxed).
  activation_ends_at timestamptz,
  -- Operator-provided justification at PIM-activation time (whatever the
  -- activator typed into the Entra MFA-prompted reason field).
  activation_reason text,
  -- Who approved the PIM activation, if PIM was configured for
  -- approval-required mode. Null if self-service (MFA only).
  pim_approver_principal text,
  -- The MFA / device claim Entra recorded. Free-form passthrough.
  mfa_claim text,
  -- Lifecycle status:
  --   pending_review — awaiting post-hoc review by a non-activator
  --   reviewed       — signed off
  --   overdue        — SLA window elapsed without review (computed)
  --   void           — administratively voided (e.g. duplicate, test)
  status varchar(32) NOT NULL DEFAULT 'pending_review',
  reviewed_at timestamptz,
  reviewed_by_id uuid REFERENCES users(id),
  review_notes text,
  -- Caller-provided context block. Free JSONB — we serialize the original
  -- PIM event there for forensic traceability without rigid schema commits.
  source_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS r10_break_glass_activations_external_unique
  ON r10_break_glass_activations (organization_id, external_activation_id);

CREATE INDEX IF NOT EXISTS r10_break_glass_activations_status_idx
  ON r10_break_glass_activations (organization_id, status, activation_started_at DESC);

CREATE INDEX IF NOT EXISTS r10_break_glass_activations_activator_idx
  ON r10_break_glass_activations (organization_id, activator_principal);
