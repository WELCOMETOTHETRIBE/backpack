-- ============================================================
-- SSP Release Baseline (Phase 1 of "controlled baseline + drift").
--
-- A signed SSP at a given version, once released through Doc Control
-- (the QMS), represents a defensible point-in-time: the payload bytes
-- are pinned by ssp_documents.payload_sha256, the cited evidence is
-- pinned by ssp_evidence_citations.evidence_sha256, the section
-- narratives are frozen in ssp_section_revisions, and the release
-- itself is anchored by ssp_doc_control_submissions.released_at +
-- qms_document_number + qms_sha256.
--
-- All of that already exists. What we don't have is a single row that
-- says "THIS released submission is the controlled baseline" — so
-- queries like "what's the active baseline for boundary X?" require
-- joining four tables and reasoning about supersession in code.
--
-- This migration adds that index row. It deliberately does NOT
-- re-snapshot anything — the source rows are already immutable enough
-- (sspDocuments.payload_sha256 + sspSignoffs.data_hash bind together).
-- The baseline row points at the released submission (1:1) and copies
-- the load-bearing fields so a baseline survives even if a later
-- migration changes how the pinned data is shaped.
--
-- Lifecycle:
--   active     → the baseline this org's SSP is currently controlled
--                against. New drift checks compare current state to
--                this row.
--   superseded → a later submission's release-baseline took over for
--                the same boundary. superseded_by_id points at the
--                successor.
--   retired    → operator-initiated decommissioning (out of scope for
--                this migration's automation; status is reserved so
--                we don't have to migrate the constraint later).
--
-- Immutability: enforced in the service layer (no update path is
-- exported except mark-superseded). A future migration MAY add a row
-- trigger that rejects UPDATE on (payload_sha256, qms_sha256,
-- signoffs_json, released_at, ssp_doc_control_submission_id) once the
-- baseline is finalized — for now the contract lives in the service.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_release_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The released submission this baseline anchors. 1:1 — there is
  -- exactly one baseline per release event.
  ssp_doc_control_submission_id uuid NOT NULL
    REFERENCES ssp_doc_control_submissions(id) ON DELETE RESTRICT,

  -- Denormalized for queryability (most baseline reads need version
  -- + boundary without joining ssp_documents).
  ssp_document_id uuid NOT NULL
    REFERENCES ssp_documents(id) ON DELETE RESTRICT,
  ssp_version_number integer NOT NULL,
  boundary_id uuid NOT NULL
    REFERENCES boundaries(id) ON DELETE RESTRICT,

  -- active | superseded | retired
  status varchar(16) NOT NULL DEFAULT 'active',

  -- Pinned at finalization (= ssp_documents.payload_sha256). Copied
  -- so the baseline row carries the bind-hash directly even if the
  -- source row is later soft-deleted or re-keyed.
  payload_sha256 varchar(64) NOT NULL,

  -- The QMS-released doc identity (= ssp_doc_control_submissions
  -- columns at release time). qms_document_number is stable across
  -- versions of the same SSP (e.g. "SSP-001"); qms_sha256 is what
  -- QMS actually signed over.
  qms_document_number text NOT NULL,
  qms_sha256 varchar(64) NOT NULL,

  -- Frozen snapshot of every ssp_signoffs row bound to this SSP at
  -- the time the release was linked. Each entry: {signoff_id, kind,
  -- signer_user_id, signer_display_name, signer_title, data_hash,
  -- signed_at, signature_alg}. Sorted by (kind, signed_at) for
  -- deterministic comparison.
  signoffs_json jsonb NOT NULL,

  -- Pointer back to the QMS manifest run that triggered the release
  -- link. Useful for retracing chain of custody from baseline →
  -- manifest → QMS-side audit.
  qms_manifest_run_id text,

  released_at timestamptz NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),

  superseded_at timestamptz,
  superseded_by_id uuid REFERENCES ssp_release_baselines(id) ON DELETE SET NULL,

  -- Optional release context. release_notes is operator-facing;
  -- app_version + git_commit_sha capture the running tool version
  -- for forensic reconstruction.
  release_notes text,
  app_version text,
  git_commit_sha text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ssp_release_baselines_status_chk
    CHECK (status IN ('active', 'superseded', 'retired'))
);

-- Idempotency anchor: at most one baseline per released submission.
-- The linker can re-run safely (e.g. on QMS manifest re-ingest);
-- the second call short-circuits on this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS ssp_release_baselines_one_per_submission_idx
  ON ssp_release_baselines (ssp_doc_control_submission_id);

-- Common reads: "list baselines for org filtered by status" and
-- "find the active baseline for a boundary."
CREATE INDEX IF NOT EXISTS ssp_release_baselines_org_status_idx
  ON ssp_release_baselines (organization_id, status);

CREATE INDEX IF NOT EXISTS ssp_release_baselines_doc_idx
  ON ssp_release_baselines (ssp_document_id);

CREATE INDEX IF NOT EXISTS ssp_release_baselines_active_per_boundary_idx
  ON ssp_release_baselines (organization_id, boundary_id, status);
