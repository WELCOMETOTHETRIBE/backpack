-- RA.L2-3.11.1 — defensibility / enrichment columns.
--
-- The v1 envelope captured status, hashes, vault pointer, and the
-- objective verdicts. Mid-pilot review with the C3PAO surfaced three
-- gaps that adjudication wants to read inline (without diving into the
-- vault zip):
--
--   1. frequency_rationale — WHY annual / quarterly was chosen.
--      The objective [a] verdict is "is frequency defined?" but the
--      defensibility question the C3PAO asks first is "why did you
--      pick that cadence given your scope and incident history?"
--      TrainOS already collects this; we now persist it.
--
--   2. system_boundary_name — the human-readable boundary label
--      ("MacTech CUI Vault — Tenant A boundary"). system_name alone
--      is the platform; the boundary scopes the assessment.
--
--   3. ssp_reference — the SSP section / version that anchors this
--      assessment ("MacTech-SSP-v3.2 §4.2"). Lets the assessor pivot
--      from the assessment record back to the controlling SSP without
--      a separate lookup.
--
-- All three are nullable to preserve backward-compat with existing
-- finalized rows. New TrainOS bridge calls populate them.

ALTER TABLE risk_assessments
    ADD COLUMN IF NOT EXISTS frequency_rationale text,
    ADD COLUMN IF NOT EXISTS system_boundary_name text,
    ADD COLUMN IF NOT EXISTS ssp_reference text;

COMMENT ON COLUMN risk_assessments.frequency_rationale IS
    'WHY this cadence was chosen — defensibility narrative for objective [a]. ≤4000 chars in practice; no hard cap here.';
COMMENT ON COLUMN risk_assessments.system_boundary_name IS
    'Human-readable boundary label scoping the assessment (distinct from system_name which is the platform).';
COMMENT ON COLUMN risk_assessments.ssp_reference IS
    'SSP section/version that anchors this assessment (e.g. "MacTech-SSP-v3.2 §4.2").';
