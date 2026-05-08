# Architecture Overview

## High-Level Architecture (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     OS HARDENING SCRIPTS                                    │
│  Invoke-CuiHardening.ps1, Invoke-AzureEntra7Hardening.ps1,                   │
│  Invoke-CuiAzureHardening.ps1, Set-RdpNla.ps1, Set-CuiLoginBannerAndWallpaper│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONFIGURED SYSTEM                                       │
│  Windows Server VM (e.g. 2025) / Azure subscription + Entra tenant           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EVIDENCE COLLECTION SCRIPTS                             │
│  Collect-Cui-Evidence-v2.ps1, Collect-AzureEntraEvidence.ps1,              │
│  export_azure_evidence.sh, collect_windows2025_cmmc_evidence.ps1             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RAW COMMAND OUTPUT                                       │
│  .txt / .json / .cfg / .xml under host/, policy/, audit/, network/,        │
│  crypto/, defender/, storage/, apps/, azure/, meta/                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NORMALIZED PASS/FAIL RESULTS                             │
│  validate_windows_server_hardening.py, Test-CuiHardening.ps1,               │
│  Test-AzureEntraControls.ps1, validate_azure_entra.py                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EVIDENCE FILES                                           │
│  validation-report-windows-hardening.json, report.json, manifest.json,     │
│  meta/hashes.sha256.txt, control-mapping.stub.json                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Where Scripts Run

| Environment | Scripts | Notes |
|-------------|---------|--------|
| **Windows VM (Azure or on-prem)** | All `.ps1` in TRUST_CODEX/vm-scripts (hardening + evidence), tools/collect_windows2025_cmmc_evidence.ps1 | PowerShell 5.1+; some require Administrator (e.g. secedit, event log ACL). |
| **Azure VM or workstation with Azure CLI** | Collect-AzureEntraEvidence.ps1, export_azure_evidence.sh | `az login` required; optional jq for export_azure_evidence.sh. |
| **Developer / CI (Linux/macOS or Windows)** | validate_windows_server_hardening.py, check-governance-documents-presence.py, build-quality-app-documents-zip.sh | Python 3, Bash. Validator consumes evidence bundle (directory or ZIP). |

---

## Execution Method

- **PowerShell:** Primary for Windows VM. Run interactively or via scheduled task / SSH-invoked wrapper (e.g. Run-CuiHardeningAndValidate-Elevated.ps1, run_evidence_runbook_via_ssh.sh).
- **Bash:** Used for Azure evidence export (export_azure_evidence.sh), VM orchestration (push_build_to_vm.sh, connect_to_vm.sh), and control-plane helpers (build-quality-app-documents-zip.sh).
- **Python:** Validators and tooling (validate_windows_server_hardening.py, validate_azure_entra.py, package_control_evidence.py, etc.).
- **CLI:** Windows: `auditpol`, `wevtutil`, `secedit`, `gpresult`, `systeminfo`, `w32tm`. Azure: `az` (role assignment, NSG, Key Vault, Entra sign-in, Conditional Access via Graph).

---

## Modularity

- **Hardening:** Invoke-CuiHardening.ps1 is the main in-VM baseline; optional Invoke-AzureEntra7Hardening.ps1, Invoke-CuiAzureHardening.ps1, Set-RdpNla.ps1, Set-CuiLoginBannerAndWallpaper.ps1 for specific areas.
- **Evidence:** Collect-Cui-Evidence-v2.ps1 is a single script that produces the full OS bundle; Collect-AzureEntraEvidence.ps1 / export_azure_evidence.sh are separate for Azure/Entra. collect_windows2025_cmmc_evidence.ps1 is an alternate Windows-only collector.
- **Validation:** validate_windows_server_hardening.py (control-plane) and Test-CuiHardening.ps1 (in-VM) both evaluate OS evidence; validate_azure_entra.py and Test-AzureEntraControls.ps1 evaluate Azure/Entra evidence.

---

## Scheduling Model

- **Manual:** Typical for pilot. Operator runs hardening once (or on change), then evidence collection and validation on demand or before assessment.
- **Scheduled:** Can be driven by Task Scheduler (Windows) or cron + SSH (e.g. continuous_drift_guard.sh, Run-CuiBulkEvidenceAndValidate.ps1 with RunId).
- **CI:** control-plane can run validate_windows_server_hardening.py in CI against a fixture or uploaded bundle.

---

## Output Directory Structure

**OS evidence bundle (e.g. C:\Evidence\CUI-Evidence-20260224-073011):**

```
<RunId>/
├── README.txt
├── host/          (systeminfo, hotfixes, roles, services, time-sync, secureboot, deviceguard, tpm, windows-update-*)
├── policy/         (account-policy, local-accounts, local-groups, secpol.cfg, user-rights-assignments, uac, lsa, ntlm, interactive-logon-notice, machine-inactivity-limit, screensaver, auth-ux, gpresult-*, rsop.xml)
├── audit/          (auditpol.txt, auditpol-subcategories, eventlog-*, security-evtx-acl, event samples)
├── network/        (firewall.txt, firewall-rules-summary, listening-ports, rdp-policy, rdp-tcp, smb-*, name-resolution-policy)
├── crypto/         (fips.txt, tls-ciphersuites.txt, schannel-protocols.txt)
├── defender/       (defender-status, defender-preferences, defender-threat-detections, defender-scan-ages)
├── storage/        (bitlocker-status, removable-storage-policies, usbstor)
├── apps/           (applocker-policy.txt)
├── azure/          (placeholder or merged Azure/Entra exports)
└── meta/           (manifest.json, hashes.sha256.txt, collector.json, bundle.json, collector-transcript.txt, control-mapping.stub.json)
```

**Azure/Entra output:** Under a folder such as `CUI-AzureEntra-<RunId>` or `evidence/runs/<RunId>/raw/azure/` with role-assignments-*.json/.txt, nsg-list, nsg-rules-*, entra-signin.*, conditional-access-policies.json, keyvault-*.*, manifest.json.

---

## How Results Are Evaluated

- **File presence:** Validator and 73-control manifest require specific files under the bundle root. Missing file → fail (or partial if support_level is PARTIAL).
- **Content checks:** Validator reads file content (e.g. crypto/fips.txt, crypto/schannel-protocols.txt, network/firewall*) and applies rules (FIPS enabled, TLS 1.2 present and weak protocols disabled, firewall enabled, SMB1 disabled, etc.). See 05_PASS_FAIL_LOGIC.md.
- **Integrity:** BUNDLE.INTEGRITY check verifies meta/manifest.json and meta/hashes.sha256.txt and that hashes match; optional in some flows.
- **Azure/Entra:** validate_azure_entra.py / Test-AzureEntraControls.ps1 check presence and content of Azure/Entra artifacts; MFA/CA may require attestation for PASS.
