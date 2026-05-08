# Pass/Fail Logic

How checks determine PASS, FAIL, and optional WARN/PARTIAL states, and where remediation guidance appears.

---

## Validator: validate_windows_server_hardening.py (73-control)

- **Input:** Evidence bundle directory (or ZIP). Manifest: `src/data/os-evidence-nist-manifest.json` (73 controls with `evidence_files` and `support_level`).
- **Output:** One check per control. Fields: `control`, `pass`, `observed`, `expected`, `evidence_hint`, `evidence_files_used`, `provider_or_customer`, `layer`, optional `details`, optional `partial`.

### PASS

- **File-presence–only controls:** All `evidence_files` listed in the manifest exist under the bundle root → PASS. Missing any → FAIL.
- **Content checks (merged into one check per control):** Each content rule evaluates to true → PASS. Rules are ANDed; if any fails → FAIL.
- **PARTIAL:** If `support_level` is `PARTIAL` and the check would otherwise PASS, the result is PASS with `"partial": true` and a note that accompanying governance documentation or records are required.

### FAIL

- Missing required evidence file(s) for that control.
- Content rule not satisfied (e.g. FIPS not enabled, weak TLS enabled, no firewall evidence, SMB1 not disabled, no auditpol evidence).

### WARN

- The validator does not define a separate WARN state. It uses PASS / FAIL and optional `partial`.

### Content Rules (examples)

| Check / control | PASS condition | FAIL condition | Remediation hint (evidence_hint) |
|-----------------|----------------|----------------|----------------------------------|
| **SC.L2-3.13.11 (FIPS)** | crypto/fips.txt contains "enabled" or "1" | Otherwise or file missing | Review crypto/fips.txt; on system: Get-ItemProperty FipsAlgorithmPolicy |
| **AC.L2-3.1.13 (TLS)** | TLS 1.2 or 1.3 in schannel; SSL 2.0/3.0 and TLS 1.0 not Enabled: 1 | Weak protocol enabled or strong missing | Review crypto/schannel-protocols.txt |
| **SC.L2-3.13.11 (ciphers)** | tls-ciphersuites.txt non-empty and no NULL | Missing or weak ciphers | Review crypto/tls-ciphersuites.txt |
| **SC.L2-3.13.1 (firewall)** | At least one firewall*.txt in network/ | No firewall evidence | Review network/ for firewall-rules or firewall.txt |
| **SC.L2-3.13.5 (RDP)** | RDP/network evidence present; 3389 restricted or documented | Unrestricted RDP and not documented | Review network/ for RDP policy and listening ports |
| **SC.L2-3.13.2 (SMB)** | SMB evidence present and SMB1 disabled | SMB1 enabled or no SMB evidence | Review network/ for SMB config |
| **AU.L2-3.3.1** | auditpol*.txt present in audit/ | Missing | Review audit/auditpol.txt; on system: auditpol /get /category:* |
| **AU.L2-3.3.4** | eventlog*.txt present in audit/ | Missing | Review audit/ for eventlog-*.txt |
| **CM.L2-3.4.6 (hotfix)** | host/hotfixes.txt non-empty (>20 chars) | Missing or empty | Review host/hotfixes.txt; Get-HotFix |
| **CM.L2-3.4.6 (update)** | windows-update-policy or windows-update-services or "Windows Update"/"WUA" in content | Missing | Review host/windows-update-policy.txt and windows-update-services.txt |
| **CM.L2-3.4.1 (Secure Boot)** | secureboot.txt has "enabled"/"true" or file present | Missing | Review host/secureboot.txt, deviceguard.txt, tpm.txt |
| **CM.L2-3.4.1 (roles)** | installed-roles-features.txt present and non-empty | Missing | Review host/installed-roles-features.txt |
| **SI.L2-3.14.2** | At least one file in defender/ | No Defender evidence | Review defender/ for status and prefs |
| **MP.L2-3.8.1 (BitLocker)** | *bitlocker* or *bit-locker* in storage/ | Missing | Review storage/ for BitLocker status |
| **MP.L2-3.8.1 (removable)** | *removable* or *usb* in storage/ | Missing | Review storage/ for removable or USB policy |
| **CM.L2-3.4.1 (AppLocker)** | *applocker* in apps/ | Missing | Review apps/ for AppLocker policy |
| **BUNDLE.INTEGRITY** | meta/manifest.json and meta/hashes.sha256.txt present; all hashed files exist and hashes match | Missing files or hash mismatch | Review meta/; re-run collector if tampered |

Remediation is conveyed in the `evidence_hint` and `expected` fields of each check; the validator does not output separate remediation steps beyond those hints.

---

## In-VM validation: Test-CuiHardening.ps1

- **Input:** Optional evidence bundle path (`-EvidenceDir`) or latest `CUI-Evidence-*` under `-OutRoot`.
- **Output:** `report.json`, `report.txt` under `CUI-Validation-<ts>/`. Each check: `id`, `control`, `title`, `pass`, `observed`, `expected`, `evidence_hint`, `timestamp_utc`.

### PASS

- Each check evaluates a condition (registry, firewall, service, file presence, etc.). Condition true → PASS.

### FAIL

- Condition false or command/query error → FAIL. `observed` contains the value or error message.

### WARN

- Not used as a distinct state; only PASS/FAIL.

### Example checks (logic)

| Check ID | Control | PASS condition | Evidence hint |
|----------|---------|-----------------|---------------|
| EVIDENCE-BUNDLE | CM.L2-3.4.1 | Evidence dir resolved (explicit or latest) | C:\evidence\CUI-Evidence-<RunId>\* |
| PLAT-OS | CM.L2-3.4.1 | OS caption present | systeminfo.txt |
| CRYPTO-FIPS | SC.L2-3.13.11 | HKLM FipsAlgorithmPolicy\Enabled = 1 | fips.txt |
| CRYPTO-TLS | SC.L2-3.13.8 | TLS 1.0/1.1 Client+Server Enabled=0; TLS 1.2 Enabled=1 | schannel-protocols.txt |
| NET-FW | SC.L2-3.13.6 | All profiles Enabled; DefaultInboundAction=Block; DefaultOutboundAction=Allow | firewall.txt |
| RM-WINRM | AC.L2-3.1.12 | WinRM Status ≠ Running and StartType = Disabled | services-remote.txt |
| LOCKOUT | AC.L2-3.1.8 | Lockout threshold set (not Never/0) | account-policy.txt |
| UAC-PROMPT | AC.L2-3.1.5 | ConsentPromptBehaviorAdmin=2; PromptOnSecureDesktop=1 | uac-policy.txt |
| LEGALNOTICE | AC.L2-3.1.9 | Legal notice caption and text non-empty | interactive-logon-notice.txt |
| AZ-INHERITANCE | AC.L2-3.1.1 | azure-inheritance.json present with boundary_statement | azure-inheritance.json |
| INACTIVITY | AC.L2-3.1.11 | InactivityTimeoutSecs > 0 | machine-inactivity-limit.txt |
| SESSION-LOCK | AC.L2-3.1.10 | ScreenSaveActive=1; ScreenSaverIsSecure=1; ScreenSaveTimeOut>0 | screensaver-policy.txt |
| RDP-REDIR | AC.L2-3.1.3 | fDisableClip=1; fDisableCdm=1; NLA(UserAuthentication)=1 | rdp-policy.txt, rdp-tcp.txt |
| RDP-SESSION-LIMITS | AC.L2-3.1.11 | MaxIdleTime, MaxDisconnectionTime, MaxConnectionTime > 0 | rdp-tcp.txt |
| AU-SECLOG | AU.L2-3.3.1 | wevtutil gl Security → enabled: true | eventlog-security.txt |
| AU-AUDITPOL | AU.L2-3.3.1 | auditpol output present and length > 200, no "error" | auditpol.txt |

Remediation is implied by `expected` and `evidence_hint`; the script does not emit separate remediation text.

---

## Azure/Entra validation (validate_azure_entra.py, Test-AzureEntraControls.ps1)

- **PASS:** Required artifacts present and content rules satisfied (e.g. MFA/CA policy present or attested).
- **FAIL:** Missing artifact or rule not met. For MFA/CA, PASS may require signed attestation in addition to technical evidence.
- **WARN:** May be used for optional or best-effort checks (implementation-dependent).

Remediation is typically documented in runbooks (e.g. EVIDENCE_RUNBOOK.md) and in script output or README in the Azure evidence folder.

---

## Summary

| Component | PASS | FAIL | WARN | PARTIAL | Remediation |
|-----------|------|------|------|---------|-------------|
| validate_windows_server_hardening.py | All files present + content rules pass | Missing file or rule fail | No | Yes (support_level=PARTIAL) | evidence_hint, expected |
| Test-CuiHardening.ps1 | Condition true | Condition false / error | No | No | expected, evidence_hint |
| Azure/Entra validators | Artifacts + rules (and attestation if required) | Missing or rule fail | Optional | Optional | Runbook, README |
