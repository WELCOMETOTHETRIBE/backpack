# Windows Server 2025 — CMMC L2 Evidence Collection Runbook (Read-Only)

This runbook accompanies:
- `tools/collect_windows2025_cmmc_evidence.ps1`
- `WINDOWS2025_OS_EVIDENCE_PACK.md`

It is designed for assessor-friendly, **repeatable**, **validation-only** evidence capture for the **missing System-Enforced (Class A)** controls flagged as **Planned / Partially Evidenced**.

## Safety rules (non-negotiable)

- The script is **read-only**: it only queries state, exports policy snapshots, and reads logs.
- **Do not** use remediation/hardening scripts during evidence collection.
- Run from an admin PowerShell prompt so exports/reads do not fail due to permissions.

## How to run (as Administrator)

1) Open an elevated PowerShell:
- Start Menu → type `PowerShell` → right-click → **Run as administrator**

2) From the repo root, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\tools\collect_windows2025_cmmc_evidence.ps1 -OutDir C:\Evidence
```

Notes:
- Output folder: `C:\Evidence\evidence\<RunId>\...`
- Zip (default): `C:\Evidence\evidence\evidence-<RunId>.zip`
- If `Compress-Archive` is blocked/unavailable, rerun with `-NoZip` and zip manually (below).

## How to zip evidence (manual fallback)

If the script couldn’t create a zip, zip the run folder:

```powershell
$RunId = (Get-ChildItem C:\Evidence\evidence -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
Compress-Archive -Path "C:\Evidence\evidence\$RunId\*" -DestinationPath "C:\Evidence\evidence\evidence-$RunId.zip" -Force
```

## What the assessor should look for

Inside the zip:
- Per-control artifacts: `AC\*.txt`, `AU\*.txt`, `CM\*.txt`, `IA\*.txt`, `MA\*.txt`, `MP\*.txt`, `RA\*.txt`, `SC\*.txt`, `SI\*.txt`
- Context: `_context\context-summary.txt`, `_context\secpol.cfg`, `_context\gpresult\gpresult-computer.txt`
- Integrity: `manifest.txt`, `hashes.sha256.txt`

## Screenshot checklist (required for “CLI-partial” controls)

These controls cannot be conclusively closed via OS CLI alone in this pilot pattern. Capture the listed screenshots/exports and place them alongside the zip (or inside a `screenshots/` folder you add to the evidence package).

### AC (Access Control)

- **AC.L2-3.1.2 (Limit access to transactions/functions)**:
  - Screenshot/export of application/IAM role mapping showing only authorized roles can perform privileged transactions/functions.
  - Screenshot of `secpol.msc` → Local Policies → User Rights Assignment (key logon rights) used as the OS boundary evidence.

- **AC.L2-3.1.7 (Prevent privileged function execution)**:
  - Screenshot of a non-admin attempt to perform a privileged action (e.g., install software / change a protected setting) showing denial/UAC prompt.
  - Optional: screenshot of the relevant Security log event if you have privilege-use auditing enabled.

- **AC.L2-3.1.15 (Authorize remote privileged commands)**:
  - Screenshot/export from your privileged access system (e.g., Entra PIM / privileged role assignments + MFA requirements) showing remote admin actions require explicit authorization.

- **AC.L2-3.1.18 (Control mobile devices)**:
  - MDM/Intune export or screenshot: device compliance policy + configuration profile(s) controlling mobile device access to CUI.

- **AC.L2-3.1.19 (Encrypt CUI on mobile devices)**:
  - MDM/Intune export or screenshot: device encryption compliance (BitLocker/FileVault/mobile encryption) for in-scope mobile endpoints.

- **AC.L2-3.1.20 (Verify external systems)**:
  - Screenshot/export: approved external systems list and verification mechanism (e.g., VPN/jump access policy, CA policy, device compliance gate).

- **AC.L2-3.1.22 (Control CUI on public systems)**:
  - Screenshot/export: DLP/endpoint restrictions preventing CUI access on public systems, or boundary policy evidence defining prohibition.

### AU (Audit & Accountability)

- **AU.L2-3.3.4 (Alert on audit logging failure)**:
  - SIEM/Sentinel/MDE screenshot/export: alert rule for audit logging failure / Security log full / audit service failure.
  - Screenshot showing the data source is connected/healthy (agent/connector health).

- **AU.L2-3.3.5 (Correlate audit records)**:
  - SIEM screenshot: correlated incident view combining multiple audit sources (e.g., logon + firewall + defender).

- **AU.L2-3.3.6 (Audit record reduction/reporting)**:
  - SIEM screenshot/export: dashboard/report used for review and reporting (date-stamped).

### IA (Identification & Authentication)

- **IA.L2-3.5.3 (MFA for privileged accounts)**:
  - Screenshot/export: Conditional Access policy requiring MFA for privileged role access.
  - Screenshot/export: PIM configuration (if used), showing activation/MFA requirements.

- **IA.L2-3.5.4 (Replay-resistant authentication)**:
  - Screenshot/export: MFA/auth method policy showing replay-resistant methods enforced for privileged access.

- **IA.L2-3.5.5 (Prevent identifier reuse)**:
  - Screenshot/export: IAM policy/workflow preventing immediate reuse of identifiers for the defined period.

- **IA.L2-3.5.6 (Disable identifiers after inactivity)**:
  - Screenshot/export: IAM inactivity policy + evidence report of disabled stale accounts.

- **IA.L2-3.5.9 (Temporary passwords)**:
  - Screenshot/export: helpdesk/IAM workflow enforcing “must change at next logon” for temporary passwords.
  - Sample redacted ticket record (or equivalent) showing the process.

### MA (Maintenance)

- **MA.L2-3.7.1 (Perform maintenance)**:
  - Change/ticket record export (redacted) showing maintenance performed as required.

- **MA.L2-3.7.2 (Controls on maintenance tools)**:
  - Admin console screenshot/export from maintenance tooling showing authorized technicians, access restrictions, and MFA (if applicable).

- **MA.L2-3.7.5 (MFA for nonlocal maintenance)**:
  - Screenshot/export: MFA enforced for remote maintenance (Bastion/IdP/CA policy).

### MP (Media Protection)

- **MP.L2-3.8.1 (Protect system media)**:
  - Media storage/handling SOP evidence; if inherited, provider attestation evidence.

- **MP.L2-3.8.2 (Limit access to CUI on media)**:
  - Screenshot/export: backup/media storage access controls (console/IAM).

- **MP.L2-3.8.3 (Sanitize/destroy media)**:
  - Sanitization/destruction records (redacted) and/or certificate of destruction.

- **MP.L2-3.8.4 (Mark media with CUI markings)**:
  - Photo/screenshot evidence of labeling standard + representative labeled media (if in scope).

- **MP.L2-3.8.5 (Control access during transport)**:
  - Chain-of-custody / transport logs (redacted) and secure transport process evidence.

- **MP.L2-3.8.9 (Protect backup CUI)**:
  - Backup solution console export showing encryption + access control and retention configuration.

### RA (Risk Assessment)

- **RA.L2-3.11.2 (Scan for vulnerabilities)**:
  - Vulnerability scanner report export (dated) including this host and findings.

- **RA.L2-3.11.3 (Remediate vulnerabilities)**:
  - Remediation ticket/change record (redacted) + scanner re-scan report showing closure.

### SC (System & Communications Protection)

- **SC.L2-3.13.2 (Architectural designs)**:
  - Approved enclave architecture + data flow diagram (export/screenshot).

- **SC.L2-3.13.3 (Separate user/system management)**:
  - IAM screenshot/export showing separation of admin roles and standard user roles.

- **SC.L2-3.13.5 (Implement subnetworks)**:
  - VNet/Subnet configuration screenshot/export and segmentation diagram.

- **SC.L2-3.13.10 (Cryptographic key management)**:
  - Key vault/KMS/HSM configuration screenshot/export and key lifecycle policy evidence.

### SI (System & Information Integrity)

- **SI.L2-3.14.3 (Monitor security alerts)**:
  - SOC/MDE/SIEM alert queue screenshot (dated) and alert rule configuration screenshot/export.

## Optional (high-value) assessor screenshots even when CLI is conclusive

- Event Viewer: Security log filtered to a few relevant Event IDs (4624/4625)
- Local Security Policy: key settings (Interactive logon notice, Machine inactivity limit, Audit policy)
- BitLocker UI showing volumes protected
- Firewall advanced security: inbound rule posture

