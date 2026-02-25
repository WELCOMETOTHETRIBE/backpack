# VM Hardening & Evidence Operations (pilot)

This chapter documents the **current in-VM hardening and evidence collection** approach for the Windows Server 2025 pilot VM.

It is written to be assessor-safe:
- It describes what exists and how it is operated.
- It does **not** claim certification.
- It does **not** claim that governance text is technical evidence.

Reference (explanatory context only): [NIST SP 800-171 Rev.3 (May 2024)](https://doi.org/10.6028/NIST.SP.800-171r3).

## Where the pilot artifacts live (current)

On the pilot VM:
- **Hardening scripts and logs**: `C:\hardening\`
  - `Invoke-CuiHardening.ps1` (idempotent hardening; logs changes)
  - `Collect-CUI-Evidence.ps1` (evidence bundle generation; creates timestamped snapshots)
  - `hardening.log` (execution log)
- **Codex-managed scripts (productizable baseline)**: `C:\hardening\codex-scripts\`
  - `Invoke-CuiHardening.ps1` (Codex baseline hardening script; changes config)
  - `Collect-Cui-Evidence.ps1` (Codex baseline evidence collection; read-only)
  - `Test-CuiHardening.ps1` (Codex baseline validation; read-only PASS/FAIL + JSON)
- **Evidence snapshots**: `C:\evidence\`
  - Example snapshot: `C:\evidence\CUI-Evidence-20260206-064323\`
  - Snapshot zip: `C:\evidence\CUI-Evidence-20260206-064323.zip`
  - Example updated snapshot: `C:\evidence\CUI-Evidence-20260206-075436\` (expanded artifact coverage)
  - Example validation output: `C:\evidence\CUI-Validation-20260206-075339\validation-report.json`

These paths are referenced in:
- `tables/EVIDENCE_INDEX.md`
- `tables/CLASS_A_IMPLEMENTATION_PLAN.md`

## What the hardening script does (high-level)

`Invoke-CuiHardening.ps1` applies a repeatable baseline and writes a log of actions. Current highlights include:
- Enabling **FIPS mode**
- Disabling legacy **TLS 1.0/1.1** and enabling **TLS 1.2**
- Enabling **LSA protection** (RunAsPPL)
- Enforcing baseline **RDP hardening** (NLA) and disabling clipboard/drive redirection
- Enabling Windows firewall across profiles; disabling **WinRM** (pilot default)
- Attempting to enable selected **Defender ASR rules** (logs if skipped)

This script is intended to support **Class A (system-enforced)** controls by producing configuration state that is auditable and reproducible.

## What the evidence collection script captures (current)

`Collect-CUI-Evidence.ps1` generates a timestamped evidence bundle under `C:\evidence\CUI-Evidence-<timestamp>\` and zips it.

Current evidence files (Codex-managed script) include:
- `systeminfo.txt`, `hotfixes.txt`, `time-sync.txt`
- `firewall.txt`, `firewall-rules-summary.txt`
- `fips.txt`, `schannel-protocols.txt`
- `local-accounts.txt`, `local-admins.txt`, `account-policy.txt`
- `lsa.txt`
- `rdp-policy.txt`, `rdp-tcp.txt`
- `auditpol.txt`, `eventlog-security.txt`, `eventlog-system.txt`, `eventlog-application.txt`
- `defender-status.txt`, `defender-preferences.txt`
- `services-remote.txt`
- `manifest.txt`, `hashes.sha256.txt`

## How evidence is regenerated (no auto-apply)

The following commands are examples of how a privileged operator would regenerate artifacts on the VM. They are included for repeatability; this Codex does not execute them automatically.

- Hardening (idempotent):

```powershell
powershell -ExecutionPolicy Bypass -File C:\hardening\Invoke-CuiHardening.ps1
```

- Evidence snapshot:

```powershell
powershell -ExecutionPolicy Bypass -File C:\hardening\codex-scripts\Collect-Cui-Evidence.ps1
```

- Read-only validation:

```powershell
powershell -ExecutionPolicy Bypass -File C:\hardening\codex-scripts\Test-CuiHardening.ps1
```

## Operational guardrails

- Evidence snapshots are treated as assessment artifacts and retained according to the pilot baseline (1 year).
- Any boundary change (new access path, new CUI ingress/egress mechanism, new systems) triggers:
  - evidence regeneration
  - mapping updates (`tables/CONTROL_MAPPING_800-171R2.md`)
  - evidence index updates (`tables/EVIDENCE_INDEX.md`)

