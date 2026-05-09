-- Phase C0 — SSP rebuild schema.
--
-- Replaces the legacy ssp_sections flat table with a versioned trio:
--   ssp_documents          — one row per generated SSP version; carries
--                            crypto provenance (payload_sha256, signature,
--                            generated_from_snapshot_at) + drift state.
--   ssp_section_revisions  — versioned per-section content keyed to a
--                            specific ssp_documents row. Lets Phase C1
--                            render Markdown / JSON / PDF deterministically
--                            from a single source of truth.
--   ssp_evidence_citations — denormalized table of every evidence row
--                            cited by a section, with the row's SHA-256
--                            pinned at generation time. The drift-detect
--                            endpoint (Phase C2) walks these to find rows
--                            that have changed since the SSP was signed.
--
-- ssp_signoffs (created in Phase A0, migration 0068) gets its FK
-- back-filled here so an AO sign-off binds to a specific ssp_documents
-- row and data_hash.
--
-- Additive migration. Legacy ssp_sections rows are NOT touched here —
-- the Phase C1 generator's reset script clears MacTech's stale rows
-- with audit trail when it's ready to issue the first new SSP version.

-- ============================================================
-- 1. ssp_documents — the versioned envelope.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_documents (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    boundary_id                 uuid NOT NULL REFERENCES boundary(id) ON DELETE RESTRICT,

    -- Monotonic per org. Phase C1 increments on every new version.
    version_number              integer NOT NULL,

    -- Lifecycle:
    --   draft       — generator finished, not yet signed
    --   signed      — Codex-key signature applied; AO sign-off may or may
    --                 not be present yet (POSTed via /api/ssp/[id]/signoff)
    --   superseded  — a newer ssp_documents row took over
    --   revoked     — operator-revoked (e.g., found a defect; supersession
    --                 takes the place of revocation in normal flow)
    status                      varchar(16) NOT NULL DEFAULT 'draft',

    generated_at                timestamptz NOT NULL DEFAULT now(),

    -- Snapshot pin: every cited evidence row was at this state when
    -- the SSP was generated. The drift-detect endpoint compares
    -- current evidence state against this anchor.
    generated_from_snapshot_at  timestamptz NOT NULL,

    -- Canonical machine-readable + human-readable serializations.
    -- Both are deterministically derived from the same generation
    -- inputs (per the AG-aligned generator in Phase C1).
    payload_json                jsonb NOT NULL,
    payload_md                  text NOT NULL,

    -- Vault-mode pointer to the PDF artifact. Null in pilot mode where
    -- the PDF is rendered on demand by /api/ssp/[id]/pdf.
    pdf_storage_uri             text,

    -- SHA-256 of the canonicalized JSON (sorted keys, ISO timestamps,
    -- normalized whitespace). The signer is bound to this hash; the
    -- AO countersignature in ssp_signoffs.data_hash matches.
    payload_sha256              varchar(64) NOT NULL,

    -- Codex-side signature (Posture A). Customer-key signature lands
    -- in ssp_signoffs as a separate row when Posture C is wired.
    signature_alg               varchar(32),
    signature_kid               varchar(64),
    signature_value             text,
    signed_at                   timestamptz,
    signed_by_user_id           uuid REFERENCES users(id) ON DELETE SET NULL,

    -- Customer countersignature placeholder for Posture C (later phase).
    -- See ssp_signoffs for structured AO/system_owner/ISSO sign-offs.
    customer_signature_json     jsonb,

    -- Supersession trail. When a newer SSP version is issued, the
    -- generator marks the prior 'signed' row as 'superseded' and
    -- points superseded_by_id at the new row.
    superseded_at               timestamptz,
    superseded_by_id            uuid REFERENCES ssp_documents(id) ON DELETE SET NULL,

    -- ── Generation provenance ────────────────────────────────────
    -- Coarse summary of what evidence backed this SSP. Useful for
    -- the audit trail without parsing payload_json.
    controls_covered            integer NOT NULL DEFAULT 0,
    controls_met                integer NOT NULL DEFAULT 0,
    controls_not_met            integer NOT NULL DEFAULT 0,
    controls_na                 integer NOT NULL DEFAULT 0,
    controls_met_via_evidence            integer NOT NULL DEFAULT 0,
    controls_met_via_esp                  integer NOT NULL DEFAULT 0,
    controls_met_via_enduring_exception  integer NOT NULL DEFAULT 0,
    controls_met_via_dod_cio              integer NOT NULL DEFAULT 0,
    controls_met_via_op_plan              integer NOT NULL DEFAULT 0,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ssp_documents_status_chk CHECK (status IN
        ('draft', 'signed', 'superseded', 'revoked')),
    CONSTRAINT ssp_documents_payload_sha256_format_chk
        CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ssp_documents_org_version_unique
        UNIQUE (organization_id, version_number)
);

CREATE INDEX IF NOT EXISTS ssp_documents_org_status_idx
    ON ssp_documents (organization_id, status, generated_at DESC);

CREATE INDEX IF NOT EXISTS ssp_documents_payload_sha256_idx
    ON ssp_documents (payload_sha256);

-- Now wire ssp_signoffs.ssp_document_id (created nullable in 0068).
ALTER TABLE ssp_signoffs
    ADD CONSTRAINT ssp_signoffs_ssp_document_fk
    FOREIGN KEY (ssp_document_id) REFERENCES ssp_documents(id) ON DELETE CASCADE;

-- ============================================================
-- 2. ssp_section_revisions — versioned per-section content.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_section_revisions (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ssp_document_id             uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,

    -- AG-aligned section taxonomy [AG pp.209–210]:
    --   system_id      — Description of the CMMC Assessment Scope
    --   scope          — CMMC Assessment Scope Description (asset inventory)
    --   environment    — Description of the Environment of Operation
    --   security_reqs  — Identified and Approved Security Requirements
    --                    (the 110-control catalog + N/A list)
    --   control        — Implementation Method per control (one row per
    --                    of the 110 controls; section_key = control_id)
    --   connections    — Connections and Relationships to Other Systems
    --   update_freq    — Defined Frequency of Updates
    --   appendix       — Auto-composed appendices (general system desc,
    --                    design philosophies, roles & responsibilities,
    --                    cryptographic posture)
    --   personnel      — System owner, custodian, ISSO, AO contact info
    --   esp            — External Service Provider inheritance section
    section_kind                varchar(32) NOT NULL,

    -- For control sections: the NIST control_id ("3.1.1"). For
    -- appendix / personnel / etc.: a stable key like "general_system_desc"
    -- or "owner".
    section_key                 text NOT NULL,

    order_index                 integer NOT NULL,
    title                       text NOT NULL,
    body_md                     text NOT NULL,
    body_json                   jsonb,

    -- SHA-256 of the section's evidence-citation list at gen time.
    -- The drift-detect endpoint compares this to the current value
    -- to decide if the section diverges.
    evidence_pinned_sha256      varchar(64) NOT NULL,

    -- Per-control sections carry the canonical state at gen time so
    -- the SSP can render verdicts without re-querying:
    aggregate_finding           varchar(16),    -- MET / NOT_MET / NA / NULL (non-control sections)
    met_via                     varchar(40),    -- evidence / esp_inheritance / etc.
    objective_verdicts          jsonb,          -- per-objective MET/NOT_MET/NA at gen time

    created_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ssp_section_revisions_section_kind_chk CHECK (section_kind IN
        ('system_id', 'scope', 'environment', 'security_reqs', 'control',
         'connections', 'update_freq', 'appendix', 'personnel', 'esp')),
    CONSTRAINT ssp_section_revisions_evidence_sha256_format_chk
        CHECK (evidence_pinned_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT ssp_section_revisions_aggregate_chk CHECK
        (aggregate_finding IS NULL OR aggregate_finding IN ('MET', 'NOT_MET', 'NA')),
    CONSTRAINT ssp_section_revisions_doc_kind_key_unique
        UNIQUE (ssp_document_id, section_kind, section_key)
);

CREATE INDEX IF NOT EXISTS ssp_section_revisions_doc_order_idx
    ON ssp_section_revisions (ssp_document_id, order_index);

CREATE INDEX IF NOT EXISTS ssp_section_revisions_doc_control_idx
    ON ssp_section_revisions (ssp_document_id, section_key)
    WHERE section_kind = 'control';

-- ============================================================
-- 3. ssp_evidence_citations — denormalized hash-pinned citations.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_evidence_citations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ssp_document_id             uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,
    ssp_section_revision_id     uuid NOT NULL REFERENCES ssp_section_revisions(id) ON DELETE CASCADE,

    -- For per-control citations; null on appendix / system-id citations.
    control_id                  varchar(20),

    -- Evidence kinds the SSP can cite:
    --   register_entry         — governance_register_entries.id
    --   attestation            — attestations.id
    --   artifact_completion    — governance_artifact_completions.id
    --   technical_run          — evidence_runs.id
    --   ois_narrative          — control_observed_implementations.id
    --   qms_doc                — qms_governance_manifest_documents.id
    --   ir_bundle              — ir_exercise_bundles.id
    --   ra_envelope            — risk_assessments.id
    --   ca_bundle              — vault-resident CaAssessmentBundle (id is the
    --                            vault's int → captured as text)
    --   poam_entry             — poam_entries.id (for met_via=op_plan citations)
    --   enduring_exception     — enduring_exceptions.id
    --   dod_cio_adjudication   — dod_cio_adjudications.id
    --   esp_inheritance        — virtual; evidence_id references provider name
    --                            from organizations.external_service_providers
    evidence_kind               varchar(40) NOT NULL,

    -- The evidence row's primary key (uuid stringified, or vault id, or
    -- composite key for esp_inheritance).
    evidence_id                 text NOT NULL,

    -- Cryptographic anchor. Computed at SSP generation time by
    -- canonicalizing the evidence row (sorted keys, ISO timestamps).
    -- Drift-detect re-canonicalizes and compares.
    evidence_sha256             varchar(64),

    -- Which assessment objective letter(s) this citation supports
    -- (e.g., ["a", "d"] for AG p.15-style tagging). Empty on appendix
    -- / boundary / system-id citations.
    supports_objectives         jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Short displayable description for the SSP body's evidence list.
    evidence_excerpt            text,

    created_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ssp_evidence_citations_evidence_kind_chk CHECK (evidence_kind IN (
        'register_entry', 'attestation', 'artifact_completion',
        'technical_run', 'ois_narrative', 'qms_doc',
        'ir_bundle', 'ra_envelope', 'ca_bundle',
        'poam_entry', 'enduring_exception', 'dod_cio_adjudication',
        'esp_inheritance'
    )),
    CONSTRAINT ssp_evidence_citations_sha256_format_chk
        CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS ssp_evidence_citations_doc_idx
    ON ssp_evidence_citations (ssp_document_id);

CREATE INDEX IF NOT EXISTS ssp_evidence_citations_section_idx
    ON ssp_evidence_citations (ssp_section_revision_id);

CREATE INDEX IF NOT EXISTS ssp_evidence_citations_doc_control_idx
    ON ssp_evidence_citations (ssp_document_id, control_id)
    WHERE control_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ssp_evidence_citations_kind_id_idx
    ON ssp_evidence_citations (evidence_kind, evidence_id);

-- ============================================================
-- 4. updated_at triggers — match project convention.
-- ============================================================

CREATE OR REPLACE FUNCTION ssp_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ssp_documents_set_updated_at ON ssp_documents;
CREATE TRIGGER ssp_documents_set_updated_at
    BEFORE UPDATE ON ssp_documents
    FOR EACH ROW EXECUTE FUNCTION ssp_set_updated_at();
