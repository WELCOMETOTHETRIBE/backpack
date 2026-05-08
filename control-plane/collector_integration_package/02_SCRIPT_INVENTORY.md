# Script Inventory

Scripts are grouped by execution context. Paths are relative to repository roots: **control-plane** (this repo) or **TRUST_CODEX** / **tools** (sibling/parent in cui-pilot).

---

## Windows VM — Hardening (Configuration Changes)

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| Invoke-CuiHardening.ps1 | TRUST_CODEX/vm-scripts/Invoke-CuiHardening.ps1 | Idempotent CMMC L2 baseline (registry, SMB, RDP, UAC, Defender, BitLocker, AppLocker) | Set-ItemProperty, net accounts, Set-SmbServerConfiguration, Set-NetFirewallProfile, Set-ItemProperty (RDP, screen saver, legal notice) | C:\Hardening\hardening-run-*.json, hardening.log | Yes |
| Invoke-AzureEntra7Hardening.ps1 | TRUST_CODEX/vm-scripts/Invoke-AzureEntra7Hardening.ps1 | Azure/Entra-related hardening (tenant-level; run where az available) | az * (policy, role, conditional access) | — | Yes |
| Invoke-CuiAzureHardening.ps1 | TRUST_CODEX/vm-scripts/Invoke-CuiAzureHardening.ps1 | Azure resource hardening (NSG, disk encryption, etc.) | az network nsg rule, az * | — | Yes |
| Set-RdpNla.ps1 | TRUST_CODEX/vm-scripts/Set-RdpNla.ps1 | Enable RDP Network Level Authentication | Set-ItemProperty Terminal Server | — | Yes |
| Set-CuiLoginBannerAndWallpaper.ps1 | TRUST_CODEX/vm-scripts/Set-CuiLoginBannerAndWallpaper.ps1 | Set legal notice and wallpaper for CUI | Set-ItemProperty, registry | — | Yes |
| Run-CuiHardeningAndValidate-Elevated.ps1 | TRUST_CODEX/vm-scripts/Run-CuiHardeningAndValidate-Elevated.ps1 | Wrapper: run hardening then validation (elevated) | Calls Invoke-CuiHardening, Test-CuiHardening | Validation report | Yes (delegates) |

---

## Windows VM — Evidence Collection (Read-Only)

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| Collect-Cui-Evidence-v2.ps1 | TRUST_CODEX/vm-scripts/Collect-Cui-Evidence-v2.ps1 | Full OS evidence bundle (73-control aligned) | systeminfo, Get-ComputerInfo, Get-LocalUser, Get-LocalGroup, secedit, auditpol, wevtutil, Get-NetFirewallProfile, Get-NetTCPConnection, Get-ItemProperty (FIPS, Schannel), Get-MpComputerStatus, Get-BitLockerVolume, Get-AppLockerPolicy, Get-HotFix, Get-WindowsFeature, gpresult | host/, policy/, audit/, network/, crypto/, defender/, storage/, apps/, azure/, meta/ (manifest.json, hashes.sha256.txt) | No |
| Collect-Cui-Evidence.ps1 | TRUST_CODEX/vm-scripts/Collect-Cui-Evidence.ps1 | Legacy/alternate CUI evidence collector | Similar CLI/cmdlets | Evidence bundle | No |
| collect_windows2025_cmmc_evidence.ps1 | tools/collect_windows2025_cmmc_evidence.ps1 | CMMC L2 evidence (assessor-friendly) | Get-*, auditpol, wevtutil, net accounts, secedit, etc. | OutDir/RunId artifacts + optional ZIP | No |
| Run-CuiBulkEvidenceAndValidate.ps1 | TRUST_CODEX/vm-scripts/Run-CuiBulkEvidenceAndValidate.ps1 | Run collector then validator for a given RunId | Calls Collect-Cui-Evidence-v2, Test-CuiHardening | Evidence bundle + validation report | No |
| Run-CuiBulkEvidenceAndValidate-RunId.ps1 | TRUST_CODEX/vm-scripts/Run-CuiBulkEvidenceAndValidate-RunId.ps1 | Same with explicit RunId parameter | Same | Same | No |

---

## Windows VM — Validation (Read-Only)

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| Test-CuiHardening.ps1 | TRUST_CODEX/vm-scripts/Test-CuiHardening.ps1 | In-VM PASS/FAIL validation of hardening + evidence presence | Get-ItemProperty (registry), Get-NetFirewallProfile, Get-Service, net accounts, wevtutil, auditpol | CUI-Validation-<ts>/report.txt, report.json | No |
| Test-EnclaveEvidencePresence.ps1 | TRUST_CODEX/vm-scripts/Test-EnclaveEvidencePresence.ps1 | Check presence of required evidence files | Test-Path, file checks | Report | No |
| Test-AzureEntraControls.ps1 | TRUST_CODEX/vm-scripts/Test-AzureEntraControls.ps1 | Validate Azure/Entra evidence artifacts | File/content checks | Report | No |

---

## Azure/Entra Evidence (Azure CLI)

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| Collect-AzureEntraEvidence.ps1 | TRUST_CODEX/vm-scripts/Collect-AzureEntraEvidence.ps1 | Azure/Entra evidence (role, sign-in, NSG, Key Vault) | az role assignment list, az ad signin list, az network nsg list/rule, az keyvault list/show | CUI-AzureEntra-<ts>/ or azure-entra/ in bundle | No |
| export_azure_evidence.sh | TRUST_CODEX/tools/export_azure_evidence.sh | Same from Bash (role, NSG, sign-in, CA, Key Vault) | az *, curl (Graph for CA) | evidence/runs/<RunId>/raw/azure/ | No |
| Run-AzureEntraCollectAndValidate.ps1 | TRUST_CODEX/vm-scripts/Run-AzureEntraCollectAndValidate.ps1 | Collect Azure/Entra then run Test-AzureEntraControls | Calls Collect-AzureEntraEvidence, Test-AzureEntraControls | Azure evidence + validation | No |

---

## Control-Plane — Validation and Tooling

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| validate_windows_server_hardening.py | control-plane/scripts/validate_windows_server_hardening.py | Validate evidence bundle against 73-control manifest; content + file presence | File read, JSON parse, regex (FIPS, TLS, firewall, SMB, audit, host, defender, storage, apps) | validation-report-windows-hardening.json, .txt | No |
| check-governance-documents-presence.py | control-plane/scripts/check-governance-documents-presence.py | Check required governance docs from CSV | os.path, csv | Governance_Documents_Presence_Checklist.csv | No |
| build-quality-app-documents-zip.sh | control-plane/scripts/build-quality-app-documents-zip.sh | Build ZIP of required governance documents | find_doc, cp, zip | Quality_App_Governance_Documents_52.zip | No |
| test_validate_windows_server_hardening.py | control-plane/scripts/tests/test_validate_windows_server_hardening.py | Unit tests for validator | subprocess (validator), json load | — | No |

---

## TRUST_CODEX Tools (Orchestration, Packaging, Validation)

| Script | Path | Purpose | Primary commands | Evidence output | Hardening |
|--------|------|---------|-------------------|------------------|-----------|
| export_azure_evidence.sh | (listed above) | Azure evidence export | az, jq, curl | azure/ | No |
| validate_azure_entra.py | TRUST_CODEX/tools/validate_azure_entra.py | Validate Azure/Entra evidence set | File/JSON checks | Validation report | No |
| run_evidence_runbook_via_ssh.sh | TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh | Run evidence runbook on VM via SSH | ssh, scp | — | No |
| run_evidence_runbook.py | TRUST_CODEX/tools/run_evidence_runbook.py | Run evidence runbook (orchestration) | Subprocess, file I/O | — | No |
| push_build_to_vm.sh | TRUST_CODEX/tools/push_build_to_vm.sh | Push TRUST_CODEX build to VM | scp, ssh | — | No |
| connect_to_vm.sh | TRUST_CODEX/tools/connect_to_vm.sh | SSH to VM | ssh | — | No |
| continuous_drift_guard.sh | TRUST_CODEX/tools/continuous_drift_guard.sh | Drift guard loop | SSH, Run-DriftGuardCheck | — | No |
| compare_validation_drift.py | TRUST_CODEX/tools/compare_validation_drift.py | Compare validation runs for drift | File/JSON diff | — | No |
| package_control_evidence.py | TRUST_CODEX/tools/package_control_evidence.py | Package control evidence | File/copy | Bundle | No |
| package_run_controls.py | TRUST_CODEX/tools/package_run_controls.py | Package run controls | File/copy | — | No |
| build_control_evidence.py | TRUST_CODEX/tools/build_control_evidence.py | Build control evidence bundle | File I/O | — | No |
| build_evidence_index_md.py | TRUST_CODEX/tools/build_evidence_index_md.py | Build evidence index markdown | File I/O | EVIDENCE_INDEX.md | No |
| ingest_validation_into_sctm.py | TRUST_CODEX/tools/ingest_validation_into_sctm.py | Ingest validation into SCTM | JSON, SCTM data | — | No |
| normalize_evidence_index_locations.py | TRUST_CODEX/tools/normalize_evidence_index_locations.py | Normalize paths in evidence index | File I/O | — | No |
| write_mfa_attestation.sh | TRUST_CODEX/tools/write_mfa_attestation.sh | Write MFA attestation | — | Attestation file | No |
| write_mfa_attestation_sig.sh | TRUST_CODEX/tools/write_mfa_attestation_sig.sh | Sign MFA attestation | — | Signature | No |
| allow_rdp_from_my_ip.sh | TRUST_CODEX/tools/allow_rdp_from_my_ip.sh | Allow RDP from current IP (NSG) | az network nsg rule | — | Yes (network) |
| load_mfa_key_for_agent.sh | TRUST_CODEX/tools/load_mfa_key_for_agent.sh | Load MFA key for agent | ssh-agent, key | — | No |
| complete_keyvault_poam_closeout.sh | TRUST_CODEX/tools/complete_keyvault_poam_closeout.sh | Key Vault POA&M closeout | az, file | — | No |
| restart_codex_manual_via_ssh.sh | TRUST_CODEX/tools/restart_codex_manual_via_ssh.sh | Restart manual app via SSH | ssh | — | No |
| ssh-askpass-helper.sh | TRUST_CODEX/tools/ssh-askpass-helper.sh | SSH askpass helper | — | — | No |
| Deploy-TrustCodexToVM.ps1 | TRUST_CODEX/vm-scripts/Deploy-TrustCodexToVM.ps1 | Deploy TRUST_CODEX to VM | Copy, extract | — | No |
| Set-DriftGuardBaseline.ps1 | TRUST_CODEX/vm-scripts/Set-DriftGuardBaseline.ps1 | Set drift guard baseline | File/hash | Baseline | No |
| Run-DriftGuardCheck.ps1 | TRUST_CODEX/vm-scripts/Run-DriftGuardCheck.ps1 | Run drift check | Compare hashes | Report | No |
| Run-DefenderMaintenance.ps1 | TRUST_CODEX/vm-scripts/Run-DefenderMaintenance.ps1 | Defender maintenance | Get-Mp*, Update-MpSignature | — | No (maintenance) |
| Invoke-DefenderMaintenanceAsync.ps1 | TRUST_CODEX/vm-scripts/Invoke-DefenderMaintenanceAsync.ps1 | Async Defender maintenance | Same | — | No |
| Install-DefenderMaintenanceTasks.ps1 | TRUST_CODEX/vm-scripts/Install-DefenderMaintenanceTasks.ps1 | Install Defender scheduled tasks | Register-ScheduledTask | — | No |
| Export-AzureInheritedControls.ps1 | TRUST_CODEX/vm-scripts/Export-AzureInheritedControls.ps1 | Export Azure inherited controls (boundary) | az *, file | azure-inheritance.json | No |
| build_control_implementation_map.py | TRUST_CODEX/vm-scripts/build_control_implementation_map.py | Build control implementation map | JSON, file | Map | No |
| Sync-EvidenceToVault.ps1 | TRUST_CODEX/vault/Sync-EvidenceToVault.ps1 | Sync evidence to vault | Copy, az (if used) | — | No |

---

## Controls Impacted (Summary)

- **AU family:** auditpol, eventlog (AU.L2-3.3.*) — Collect-Cui-Evidence-v2.ps1, validate_windows_server_hardening.py.
- **AC / IA / MA (OS):** policy, UAC, RDP, session lock, account policy — Invoke-CuiHardening.ps1, Collect-Cui-Evidence-v2.ps1, Test-CuiHardening.ps1.
- **IA/MA (Entra):** IA.L2-3.5.3–3.5.6, MA.L2-3.7.5 — Collect-AzureEntraEvidence.ps1, export_azure_evidence.sh, validate_azure_entra.py.
- **SC (crypto, network):** SC.L2-3.13.1, 3.13.2, 3.13.5, 3.13.6, 3.13.8–3.13.11 — crypto/, network/ evidence + validator.
- **CM, MP, SI, RA:** host/, defender/, storage/, apps/ — Collect-Cui-Evidence-v2.ps1, validate_windows_server_hardening.py.
