-- EnclaveWatch in-vault UI base URL (per-org).
--
-- When set, the codex renders "View on EnclaveWatch" deep-links from
-- vuln_remediation register entries to the per-machine timeline view at
-- <base_url>/Vulnerabilities. The link is reachability-conditional --
-- the auditor's network must be able to hit the vault host. NULL for
-- orgs that haven't published an EnclaveWatch UI URL or whose vault is
-- network-isolated from auditor workstations.
--
-- Format: "https://<host>:9443" (no trailing slash).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enclavewatch_base_url TEXT;
