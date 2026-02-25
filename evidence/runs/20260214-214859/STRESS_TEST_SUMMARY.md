# Enclave stress test summary — Run 20260214-214859

**Date (UTC):** 2026-02-14  
**VM:** cui-win-pilot-0 (admin_patrick@20.57.129.142)  
**Workflow:** Hardening → Collect evidence → Validate (enclave + Azure/Entra)

---

## 1. Enclave configuration + evidence (Test-CuiHardening)

| Metric | Result |
|--------|--------|
| **Validator checks** | **39 PASS, 0 FAIL** |
| **Configuration** | Compliant (hardening applied before collect) |
| **Evidence generation** | All required artifacts present |

### Configuration

- **Hardening:** `Invoke-CuiHardening.ps1` was run before collect (RDP redirection, NLA, inactivity, NTLM, auth UX).
- **RDP-REDIR (AC.L2-3.1.3):** Now **PASS** (previously FAIL; hardening fixed clipboard/drive disable and NLA=1).
- All 39 automated checks passed: FIPS, TLS, firewall, lockout, UAC, legal notice, Azure inheritance, inactivity, session lock, RDP-REDIR, audit, time sync, secpol, guest/autologon, SMB signing, Defender, AUTH-UX, NTLMV2, LSA-PPL, USB/portable storage, SMB1, local admins, AppLocker, BitLocker, password history, etc.

### Evidence bundle (CUI-Evidence-20260214-214859)

- **Hashes:** `hashes.sha256.txt` present (integrity).
- **Key artifacts:** secpol.cfg, azure-inheritance.json, auditpol.txt, defender-status.txt, bitlocker-status.txt, rdp-policy.txt, rdp-tcp.txt, and all other validator-referenced files present.
- **Count:** 60+ evidence files in bundle.

**Conclusion:** Enclave is **compliant for configuration and evidence generation** for all 39 automated validator checks. No enclave control checks failed.

---

## 2. Azure/Entra 7-control validation (same run)

| Metric | Result |
|--------|--------|
| **Checks** | 2 PASS, 5 FAIL (7 total) |
| **PASS** | SC.L2-3.13.10 (Key Vault), SC.L2-3.13.5 (NSG) |
| **FAIL** | IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6, MA.L2-3.7.5 — all due to missing **mfa-in-path-attested.txt** |

The 5 failures are evidence/attestation gaps (MFA in access path not attested), not configuration failures. Add `mfa-in-path-attested.txt` once MFA is in the enclave access path (e.g. VPN+Entra or Azure AD login for RDP, or document SSH passphrase key as MFA). See `reports/AZURE_ENTRA_FIVE_CONTROLS_COMPLIANCE_STATUS.md`.

---

## 3. Scope: 39 checks vs “73 enclave enforced controls”

- The **validator (Test-CuiHardening)** runs **39 automated checks** that map to **30 unique control IDs** (e.g. AU.L2-3.3.1 has several checks).
- The **manual** has **73 enclave System-Enforced** controls (excluding the 7 Azure/Entra). Of those, **30** are covered by the validator; the **other 43** have no automated PASS/FAIL check.
- **The other 43:** Satisfied by **evidence presence** (artifact in bundle), **enclave design** (e.g. no mobile/wireless, USB disabled), or **governance/manual** attestation. See **`TRUST_CODEX/docs/ENCLAVE_ENFORCED_COVERAGE.md`** for the full list and how each is intended to be satisfied.
- **This stress test:** All **39 enclave validator checks** passed (configuration + evidence). Azure/Entra: 2/7 passed on artifacts; 5/7 require MFA-in-path attestation.

---

## 4. Artifacts

| Path | Description |
|------|-------------|
| `raw/CUI-Evidence-20260214-214859/` | Evidence bundle (60+ files, hashes.sha256.txt) |
| `raw/CUI-Validation-20260214-214859/validation-report.txt` | Enclave validation (39 PASS, 0 FAIL) |
| `raw/CUI-Validation-20260214-214859/validation-report.json` | Machine-readable enclave report |
| `raw/CUI-Validation-AzureEntra-20260214-214859/` | Azure/Entra 7-control report (2 PASS, 5 FAIL) |
| `raw/azure/` | Azure/Entra evidence (role assignments, NSG, Key Vault, sign-in, etc.) |

---

**Summary:** Enclave configuration and evidence generation are **fully compliant** for the automated baseline (39/39 checks PASS). For the full set of enclave-enforced controls, use this run for ingest and attest; address the 5 Azure/Entra IA/MA controls via MFA-in-path attestation when applicable.
