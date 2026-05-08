-- EnclaveWatch unattended-ingest bearer token (per-org).
-- Issued via src/scripts/issue-enclavewatch-token.ts; sent by EnclaveWatch
-- in the Authorization header on the three ingest endpoints listed in
-- the schema.ts comment. NULL for orgs that haven't enabled EnclaveWatch.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enclavewatch_api_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_enclavewatch_api_token_unique
  ON organizations (enclavewatch_api_token)
  WHERE enclavewatch_api_token IS NOT NULL;
