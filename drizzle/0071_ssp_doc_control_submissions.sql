-- ============================================================
-- Phase 1 of "Send to Doc Control for SSP release."
--
-- The SSP currently lives in ssp_documents (Codex-side, generated +
-- self-signed via attestation). To bring it into the same governance
-- pipeline as every other authorized record (which flows through the
-- MacTech Quality QMS and lands in qms_governance_manifest_documents
-- via the manifest ingest), we record each "submitted to Doc Control"
-- event as its own row. The state machine:
--
--   submitted   — Codex POSTed the package to MacTech Quality and
--                 awaits Reviewer/Approver/Quality-Release signatures.
--   released    — QMS released the doc; the next manifest ingest
--                 carried it back, and the Codex linker matched
--                 (document_number, sha256) → this row was promoted.
--   superseded  — A newer submission for the same ssp_document_id
--                 (or for the next SSP version) has been released,
--                 retiring this one.
--   rejected    — Reviewer / Approver / QR refused to release.
--                 rejected_reason carries the operator-facing detail.
--
-- Phase 1 ships only the schema + the Codex-side state machine. The
-- outbound bridge (Phase 2) and the inbound linker (Phase 3) ship
-- once the QMS team is ready to expose the receiving endpoint.
-- ============================================================

CREATE TABLE IF NOT EXISTS ssp_doc_control_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ssp_document_id uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,

  -- submitted | released | superseded | rejected
  status varchar(16) NOT NULL DEFAULT 'submitted',

  -- payload_sha256 captured at submission time. The QMS-side release
  -- will sign over its OWN (possibly differently-canonicalized) bytes,
  -- so we keep both: this one for "what did Codex hand off" and the
  -- qms_sha256 (below) for "what did QMS actually release."
  submitted_payload_sha256 varchar(64) NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  -- The QMS document_number once released (e.g. "SSP-001"). Stable
  -- across SSP versions; the version itself moves via the QMS doc's
  -- own version field.
  qms_document_number text,
  qms_sha256 varchar(64),
  released_at timestamptz,

  superseded_at timestamptz,
  superseded_by_id uuid REFERENCES ssp_doc_control_submissions(id) ON DELETE SET NULL,

  rejected_at timestamptz,
  rejected_reason text,

  -- Operator notes captured at submit time (e.g. "Annual reissue per
  -- AG p.209 cadence"). Optional.
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ssp_doc_control_submissions_status_chk
    CHECK (status IN ('submitted','released','superseded','rejected'))
);

-- One in-flight submission per (org, ssp_document_id). Re-submission
-- requires the prior 'submitted' row to transition first.
CREATE UNIQUE INDEX IF NOT EXISTS ssp_doc_control_submissions_one_inflight_idx
  ON ssp_doc_control_submissions (organization_id, ssp_document_id)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_org_idx
  ON ssp_doc_control_submissions (organization_id, status);

CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_doc_idx
  ON ssp_doc_control_submissions (ssp_document_id, status);

CREATE INDEX IF NOT EXISTS ssp_doc_control_submissions_qms_match_idx
  ON ssp_doc_control_submissions (organization_id, qms_document_number, qms_sha256);
