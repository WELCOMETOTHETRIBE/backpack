-- Sprint 9 — TrainOS → Codex integration.
--
-- Adds the per-org TrainOS tenant identifier and webhook secret that the
-- inbound `evidence.attempt.completed` route resolves on each delivery, and
-- creates the `trainos_deliveries` audit/dedup table. Replay of a previously
-- accepted delivery returns the cached verdict — same pattern as
-- isso_export_manifests.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trainos_tenant_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS trainos_webhook_secret text;

COMMENT ON COLUMN organizations.trainos_tenant_id IS
  'TrainOS Tenant.id (cuid). Set during onboarding via /dashboard/settings/integrations/trainos. Webhook handler resolves orgId by this column; missing row → terminal 404 (tenant_not_onboarded).';
COMMENT ON COLUMN organizations.trainos_webhook_secret IS
  'Per-tenant HMAC secret (hex). Used to validate sha256={hex(hmac_sha256(secret,"{ts}.{body}"))} on inbound deliveries. Manual two-phase rotation via Settings UI; dual-window deferred to v3 brief.';

CREATE TABLE IF NOT EXISTS trainos_deliveries (
    delivery_id          uuid PRIMARY KEY,
    organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Event envelope.
    event                varchar(80) NOT NULL,
    schema_version       varchar(8),
    canonicalization_ver varchar(8),

    -- TrainOS identifiers (for back-reference and dedup hardening).
    evidence_record_id   text NOT NULL,
    evidence_hash        text NOT NULL,
    certificate_number   text,
    occurred_at          timestamptz NOT NULL,

    -- Cached verdict response (returned verbatim on replay).
    verdict_response     jsonb NOT NULL,
    verdict_overall      varchar(32) NOT NULL,

    -- Body hash for 409 detection: same delivery_id with different body = bug.
    request_body_hash    text NOT NULL,

    -- Telemetry.
    received_at          timestamptz NOT NULL DEFAULT now(),
    sandbox              boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS trainos_deliveries_org_received_idx
  ON trainos_deliveries(organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS trainos_deliveries_evidence_record_idx
  ON trainos_deliveries(evidence_record_id);
