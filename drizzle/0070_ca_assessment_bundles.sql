-- Phase D follow-up — Codex-side mirror of the vault's CaAssessmentBundle.
--
-- Background
-- ----------
-- The MacTech vault maintains CaAssessmentBundle as a mirror of TrainOS-
-- archived CA.L2-3.12.{1,2,3,4} cycle bundles in customer Azure Blob
-- storage. The vault polls the blob enumerator on a 5-min cadence and
-- renders the auditor view at /CaAssessments. There's no Codex-side
-- mirror today, so the SSP generator can't cite CA cycle hashes.
--
-- This migration adds the Codex parallel: ca_assessment_bundles. TrainOS
-- pushes finalized cycle metadata via /api/ca-assessments/bundles
-- (added in this PR); Codex stores the same metadata + cryptographic
-- anchors the vault sees, so:
--
--   1. The SSP generator can cite a ca_bundle row with its
--      content_hash / package_sha256 / manifest_sha256 (three-tier
--      provenance, mirroring how IR tabletop bundles work).
--   2. The drift-detect endpoint can verify "the CA cycle whose
--      hashes I pinned at SSP-generation time is still on file."
--   3. /dashboard/cae and /dashboard/controls/3.12.x can surface
--      "last cycle finalized YYYY-MM-DD; next due in N days" without
--      a vault round-trip.
--
-- Boundary discipline (per PRODUCT.md): this row stores blob METADATA
-- only — control_ids + control_verdicts CSV ("CA.L2-3.12.1=MET,...")
-- + signoff chain + hashes. Per-control adjudication narrative,
-- objective findings, OPAP closure evidence, management attestation
-- text — all inside the ZIP on the vault's side, and never crosses
-- the Codex boundary.

CREATE TABLE IF NOT EXISTS ca_assessment_bundles (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- TrainOS-side cycle cuid. Unique per (org, cycle_id) so re-pushes
    -- are idempotent.
    cycle_id                 text NOT NULL,
    cycle_title              text NOT NULL,
    cycle_type               text,                       -- ANNUAL_FORMAL etc.

    -- Three-tier crypto provenance (matches the vault entity):
    --   content_hash    — over the canonical evidence inputs
    --   package_sha256  — over the whole ZIP
    --   manifest_sha256 — over Evidence-Manifest.json
    content_hash             varchar(64),
    package_sha256           varchar(64),
    manifest_sha256          varchar(64),

    package_version          integer NOT NULL DEFAULT 1,

    finalized_at_utc         timestamptz,
    retention_until_utc      timestamptz,

    -- Control coverage metadata. control_ids carries the CMMC IDs
    -- (CA.L2-3.12.1,CA.L2-3.12.2,CA.L2-3.12.3,CA.L2-3.12.4); the
    -- corresponding NIST short forms are the SSP citation keys.
    control_ids              text,                       -- comma-separated
    -- Per-control verdict CSV: "CA.L2-3.12.1=MET,CA.L2-3.12.2=MET,...".
    -- Already in the C3PAO-facing MET vocabulary; the canonical helper
    -- can read these directly when projecting CA family findings.
    control_verdicts         text,

    ssp_version              text,
    boundary_version         text,

    -- Sign-off chain.
    lead_assessor            text,
    reviewer                 text,
    approver                 text,

    sctm_status              text,                       -- FINALIZED / ADJUDICATED / etc.

    control_family           text DEFAULT 'CA.L2',
    cui                      boolean NOT NULL DEFAULT false,

    vault_storage_uri        text,
    vault_storage_region     text,

    -- Source-app provenance.
    source_app               varchar(40) NOT NULL DEFAULT 'mactech-training',

    received_at              timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ca_assessment_bundles_org_cycle_unique
        UNIQUE (organization_id, cycle_id),
    CONSTRAINT ca_assessment_bundles_content_hash_format_chk
        CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ca_assessment_bundles_package_hash_format_chk
        CHECK (package_sha256 IS NULL OR package_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ca_assessment_bundles_manifest_hash_format_chk
        CHECK (manifest_sha256 IS NULL OR manifest_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS ca_assessment_bundles_org_finalized_idx
    ON ca_assessment_bundles (organization_id, finalized_at_utc DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS ca_assessment_bundles_package_sha256_idx
    ON ca_assessment_bundles (package_sha256);

-- updated_at trigger.
CREATE OR REPLACE FUNCTION ca_assessment_bundles_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ca_assessment_bundles_set_updated_at ON ca_assessment_bundles;
CREATE TRIGGER ca_assessment_bundles_set_updated_at
    BEFORE UPDATE ON ca_assessment_bundles
    FOR EACH ROW EXECUTE FUNCTION ca_assessment_bundles_set_updated_at();
