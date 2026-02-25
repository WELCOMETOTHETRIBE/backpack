# Gaps, Risks, and POA&M Candidates (explicit)

This chapter exists to prevent silent gaps. It is intentionally candid.

## Assessment-safe status (no overclaims)

**Authoritative control status** comes from `tables/SCTM_FULL_STATUS_LIST.csv` and `tables/CONTROL_CLOSEOUT_FROM_SCTM.md` (generated from SCTM). Use only these statuses in submissions and narratives:

- **Implemented (Evidenced on Pilot VM)** — Only when the validation run used for that control shows all required validator checks PASS. Do not claim this for a control if `validation-report.json` shows `failed_checks` or `missing_files` for that control.
- **Governed (Docs Present; Records Pending)** — Policy/SOP exist; operational records (e.g. training log, IR test report) are produced per cadence but may not yet be in the evidence vault. Do not state that the control is fully satisfied without attached records.
- **Governed (Records Attached)** — Governance records are in the evidence index/vault.
- **N/A (Documented)** — Boundary-tied N/A with documented rationale (e.g. no wireless in scope).
- **Planned / Partially Evidenced** — Implementation or evidence in progress; required validator checks not yet PASS.

Do **not** use "all 110 controls implemented," "full compliance," or "100% compliant" in any deliverable. See `docs/PRE_SUBMISSION_REMEDIATION_AND_HARDENING.md` for the pre-submission checklist.

## Bundle conflicts (must be corrected during tailoring)

- **Overclaim language**: The SSP template includes statements like “all 110 controls implemented / full compliance achieved.” Use the exact SCTM statuses in the Assessment-safe status section above and the validator rule (claim Implemented only when required checks pass).
- **Historical implementation bleed-through**: The governance bundle references a historical web application stack and non-Azure providers. Those must not be treated as pilot technical truth.
- **Internal inconsistencies**: Some documents include both “implemented” and “not implemented” statements for the same topics (e.g., MFA/training). Those must be reconciled into a single authoritative pilot position.
- **Revision alignment risk (Rev.2 vs Rev.3)**: NIST SP 800-171 Rev.3 (May 2024) supersedes Rev.2, but **CMMC 2.0 Level 2 assessments remain anchored to Rev.2** in current practice. Rev.3 is used in this Codex only as an explanatory reference (e.g., organization-defined parameters and clarified intent), not as the controlling requirement set.

## Pilot risks (architectural)

- **Evidence architecture not yet implemented**: log pipelines, evidence storage, and automated evidence regeneration are not yet built in this repo.
- **Cryptography/FIPS configuration**: the pilot must explicitly define how FIPS-validated cryptography is achieved in the Windows/Azure context (and what is inherited vs configured).

## RDP session termination / re-authentication (AC.L2-3.1.11) — remediated in hardening

When RDP connection times out or is dropped, the session must be **ended** so reconnecting requires re-authentication. **Remediation**: `Invoke-CuiHardening.ps1` now sets RDP session time limits (MaxIdleTime, MaxDisconnectionTime, MaxConnectionTime). After **MaxDisconnectionTime** (default 5 min), the disconnected session is terminated (user logged off), so reconnection requires a new logon. The validator check **RDP-SESSION-LIMITS** must pass (with INACTIVITY) to claim AC.L2-3.1.11. **Action**: Run hardening on the VM, then re-run evidence collection and validation; only claim AC.L2-3.1.11 as Met when both INACTIVITY and RDP-SESSION-LIMITS pass. See **docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md** §1.2a.

## Likely POA&M items (initial candidates)

These are candidates until technical implementation is complete and verified:
- **AC.L2-3.1.11 (RDP path)**: Ensure hardening has been run with RDP session limits (default) and validation shows INACTIVITY + RDP-SESSION-LIMITS pass (see "RDP session termination" above).
- Missing centralized logging and retention verification outputs
- Missing time synchronization verification evidence
- Missing documented “approved, logged mechanism” for any required CUI transfer use-cases (if any exist)

## Assumptions requiring confirmation

These defaults are assumed for the pilot:
- Enclave-only (no application layer)
- Entra ID cloud-only identity
- VPN + RDP administrative access (no public RDP)
- No removable media and no redirection
- 1-year retention baseline

