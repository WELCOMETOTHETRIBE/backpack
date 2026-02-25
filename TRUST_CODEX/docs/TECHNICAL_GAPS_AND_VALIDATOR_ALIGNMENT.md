# Technical Gaps and Validator Alignment

This document closes high-signal technical gaps (RDP redirection, inactivity timeout) and defines how **claimed control status** (e.g. in SCTM, manual app, or attestations) must align with validator outputs.

## 1. High-signal technical controls

### 1.1 RDP redirection disablement (AC.L2-3.1.3, AC.L2-3.1.21)

- **Requirement**: Control flow of CUI / limit portable storage; RDP must not allow clipboard or drive redirection, and NLA must be enabled.
- **Validator check**: `RDP-REDIR` in `Test-CuiHardening.ps1` — passes when:
  - `fDisableClip = 1` (HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services)
  - `fDisableCdm = 1` (same path)
  - `UserAuthentication = 1` (NLA) (HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp)
- **Hardening**: `Invoke-CuiHardening.ps1` sets all three (and `DisablePasswordSaving`) in the "RDP hardening" block. No conditional: these are applied whenever the script runs.
- **C3PAO critical finding (remediated)**: A C3PAO-style assessment reported NLA disabled (`UserAuthentication=0`) as a critical deficiency (AC.L2-3.1.3). Remediation: (1) `Invoke-CuiHardening.ps1` now sets **UserAuthentication** explicitly as **DWord** in both the runtime path (`HKLM:\...\Terminal Server\WinStations\RDP-Tcp`) and the policy path (`HKLM:\SOFTWARE\Policies\...\Terminal Server\WinStations\RDP-Tcp`) using `New-ItemProperty -PropertyType DWord -Force`. (2) A one-off script `Set-RdpNla.ps1` applies only the NLA fix for quick remediation without full hardening.
- **If RDP-REDIR fails**: Run full hardening or `Set-RdpNla.ps1` (e.g. `powershell -ExecutionPolicy Bypass -File C:\hardening\Set-RdpNla.ps1`). Then re-run evidence collection and validation. Do **not** claim AC.L2-3.1.3 or AC.L2-3.1.21 as Met until the validator reports RDP-REDIR pass.

### 1.2 Inactivity timeout / session termination (AC.L2-3.1.11)

- **Requirement**: Automatic session termination after a defined period of inactivity.
- **Validator check**: `INACTIVITY` — passes when `InactivityTimeoutSecs` (HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System) is present and &gt; 0.
- **Hardening**: `Invoke-CuiHardening.ps1` sets `InactivityTimeoutSecs` (default 900) and screen saver timeout to the same value when `$InactivityTimeoutSecs -gt 0`.
- **If INACTIVITY fails**: Run hardening with the default or an explicit `-InactivityTimeoutSecs` (e.g. 900). Re-run evidence collection and validation. Do not claim AC.L2-3.1.11 as Met until INACTIVITY passes.

### 1.2a RDP session termination and re-authentication (AC.L2-3.1.11 — remote access path)

- **Requirement**: NIST 800-171 3.1.11 requires terminating **logical sessions** (including remote access). When RDP disconnects or goes idle, the session must be ended so that reconnecting requires re-authentication.
- **Hardening**: `Invoke-CuiHardening.ps1` sets RDP session time limits (default: 15 min idle, 5 min disconnect, 8 h max connection) under `HKLM:\...\Terminal Server\WinStations\RDP-Tcp`:
  - **MaxIdleTime**: disconnect after period of inactivity (ms).
  - **MaxDisconnectionTime**: after this period disconnected, the **session is ended** (user logged off); reconnection then requires re-authentication.
  - **MaxConnectionTime**: maximum session duration (ms).
- **Validator check**: `RDP-SESSION-LIMITS` — passes when MaxIdleTime, MaxDisconnectionTime, and MaxConnectionTime are present and &gt; 0. Required for AC.L2-3.1.11 together with INACTIVITY.
- **Evidence**: `rdp-tcp.txt` (from `Collect-Cui-Evidence.ps1`) plus `machine-inactivity-limit.txt`. Both are required for AC.L2-3.1.11 (`$extraReq`, `$reqChecks` in Test-CuiHardening.ps1).
- **If RDP-SESSION-LIMITS fails**: Run hardening (default parameters set RDP limits; or pass `-RdpMaxIdleMinutes 15 -RdpMaxDisconnectionMinutes 5 -RdpMaxConnectionHours 8`). Re-run evidence collection and validation. Do not claim AC.L2-3.1.11 as Met until both INACTIVITY and RDP-SESSION-LIMITS pass.

### 1.3 Session lock (AC.L2-3.1.10)

- **Validator check**: `SESSION-LOCK` — secure screen saver enabled with timeout &gt; 0.
- **Hardening**: Screen saver enabled, secure, and timeout set in the same session/lock block as inactivity.

### 1.4 NTLM v2 only (IA.L2-3.5.10 — cryptographically-protected passwords)

- **Requirement**: Store and transmit only cryptographically-protected passwords (salted one-way hashes; no NTLM v1).
- **Validator check**: `NTLMV2` — LAN Manager authentication level must require NTLM v2 (e.g. `LmCompatibilityLevel` ≥ 5).
- **Hardening**: Set `HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\LmCompatibilityLevel` = 5 (or 4 minimum). Invoke-CuiHardening.ps1 should set this in the authentication/security options block.
- **If NTLMV2 fails**: Apply hardening (LmCompatibilityLevel 5), re-run evidence and validation. Do not claim IA.L2-3.5.10 as Met until the validator reports NTLMV2 pass.

### 1.5 Obscure authentication feedback (IA.L2-3.5.11)

- **Requirement**: Obscure feedback of authentication information (e.g. no plaintext password in logon UI).
- **Validator check**: `AUTH-UX` — e.g. “Do not display last user name”, secure logon prompt, or equivalent UX setting that reduces shoulder-surfing / credential exposure.
- **Hardening**: Configure “Interactive logon: Don’t display last signed-in” and related Group Policy / local security options. Invoke-CuiHardening.ps1 should set these in the logon UX block.
- **If AUTH-UX fails**: Apply hardening, re-run evidence and validation. Do not claim IA.L2-3.5.11 as Met until AUTH-UX passes.

## 2. Validator coverage and claimed status

### 2.1 Rule: claim only when validator agrees

For any control that appears in the validator’s **required checks** (`$reqChecks` in `Test-CuiHardening.ps1`), the enclave should **not** claim that control as **Met** (or equivalent) in SCTM, manual app, or assessor handoff unless:

1. The validation run for the evidence bundle used to support that control shows **all** required checks for that control as **pass**, and  
2. Any required evidence files (per `$extraReq` / `$familyReq`) are present in the evidence bundle.

Example: AC.L2-3.1.3 has `reqChecks = @('RDP-REDIR')`. If `validation-report.json` shows `RDP-REDIR` as failed, the control must be reported as Not Met (or Planned/Partial) until remediation and re-validation.

### 2.2 Controls with required validator checks (high-signal subset)

| Control ID        | Required check(s)     | Evidence hint / files |
|-------------------|------------------------|------------------------|
| AC.L2-3.1.3       | RDP-REDIR             | rdp-policy.txt, rdp-tcp.txt |
| AC.L2-3.1.9       | LEGALNOTICE           | interactive-logon-notice.txt |
| AC.L2-3.1.10      | SESSION-LOCK          | screensaver-policy.txt |
| AC.L2-3.1.11      | INACTIVITY, RDP-SESSION-LIMITS | machine-inactivity-limit.txt, rdp-tcp.txt |
| AC.L2-3.1.12      | RM-WINRM              | (WinRM disabled) |
| AC.L2-3.1.21      | PORTABLE-STORAGE      | usbstor.txt, removable-storage-policies.txt |
| IA.L2-3.5.10      | NTLMV2                | (LmCompatibilityLevel registry / security policy) |
| IA.L2-3.5.11      | AUTH-UX               | (Interactive logon / don’t display last user; secure logon) |

The full mapping is in `Test-CuiHardening.ps1` (`$reqChecks`, `$extraReq`, `$familyReq`). CI or packaging scripts that produce “assessor-ready” status should consume `validation-report.json` and only mark a control Met when its required checks pass.

### 2.3 Class B and inherited controls

Class B (governance) and Inherited/Not Applicable controls are not fully determined by the VM validator. Their status is set by policy/SOP/records and inheritance documentation. The validator may still produce evidence that is **included** in the control bundle (e.g. validation report for CA.L2-3.12.1); the rule above applies only where the validator defines required checks for that control.

## 3. Remediation checklist

- [ ] Run `Invoke-CuiHardening.ps1` (or `Run-CuiHardeningAndValidate-Elevated.ps1`) so that RDP redirection, inactivity, and session lock are applied.
- [ ] Re-run `Collect-Cui-Evidence.ps1` and `Test-CuiHardening.ps1` to produce a new evidence and validation run.
- [ ] Confirm `validation-report.json` shows RDP-REDIR, INACTIVITY, SESSION-LOCK (and any other required checks for claimed controls) as pass.
- [ ] Update SCTM/manual app/attestation so that no control is claimed Met if its required checks failed for that run.
- [ ] When building per-control bundles, include the validation slice for that control and document the RunId so assessors can trace to the same validation run.

## 4. References

- `TRUST_CODEX/vm-scripts/Invoke-CuiHardening.ps1` — RDP block (~line 412), session lock/inactivity (~line 257).
- `TRUST_CODEX/vm-scripts/Test-CuiHardening.ps1` — `$reqChecks`, `$extraReq`, RDP-REDIR, INACTIVITY, SESSION-LOCK.
- `TRUST_CODEX/tables/EVIDENCE_INDEX.md` — evidence types and vault paths per control.
- `TRUST_CODEX/tables/CONTROL_MAPPING_800-171R2.md` — control intent and classification.
