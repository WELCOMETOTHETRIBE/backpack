# Collector Integration Package

**Purpose:** This package documents the architecture and outputs of the OS hardening and evidence collection system used to gather OS and Azure configuration evidence for NIST SP 800-171 / CMMC L2 compliance. It is intended for **external architectural review** and does **not** require running the scripts.

**Environment:** Non-production. Secrets are not aggressively redacted in this package; credentials in config files are not exported.

---

## What This Package Contains

| Document | Description |
|----------|-------------|
| **00_README.md** | This file — package overview and usage |
| **01_ARCHITECTURE.md** | High-level architecture, execution model, output structure |
| **02_SCRIPT_INVENTORY.md** | All PowerShell, Bash, Python, and Batch scripts with purpose and outputs |
| **03_COMMANDS_USED.md** | Command-line tools used (PowerShell, Azure CLI, Windows CLI) |
| **04_EVIDENCE_MANIFEST.json** | List of evidence files produced, source, and sensitivity |
| **05_PASS_FAIL_LOGIC.md** | How PASS/FAIL (and WARN) are determined; remediation guidance |
| **06_CONTROL_MAP.json** | Mapping of control IDs to scripts and evidence files |
| **07_SAMPLE_OUTPUTS/** | Example output structure (and pointer to full runs) |
| **08_DATA_DICTIONARY.md** | Fields in evidence JSON and validation reports |

---

## How the Collector Works

1. **Hardening (optional):** Scripts such as `Invoke-CuiHardening.ps1` apply a CMMC L2–aligned baseline on a Windows Server VM (registry, local policy, SMB, RDP, Defender, etc.). These scripts **change** configuration and are idempotent where feasible.

2. **Evidence collection:** Read-only scripts (e.g. `Collect-Cui-Evidence-v2.ps1`) run on the same VM and capture:
   - Host identity, patches, roles, services
   - Local policy (secpol, accounts, user rights, UAC, LSA)
   - Audit policy and event log configuration (and optional samples)
   - Network (firewall, listening ports, SMB, RDP)
   - Crypto (FIPS, Schannel/TLS)
   - Defender status and preferences
   - Storage (BitLocker, removable/USB policy)
   - AppLocker (if available)

3. **Azure/Entra evidence:** Separate scripts (`Collect-AzureEntraEvidence.ps1`, `export_azure_evidence.sh`) run where Azure CLI is available and export role assignments, NSGs, Key Vault, Conditional Access (where supported), and sign-in data for the seven Azure/Entra controls.

4. **Validation:** The control-plane validator (`validate_windows_server_hardening.py`) reads an evidence bundle (directory or ZIP), evaluates content and file presence against the 73-control OS evidence manifest, and produces a normalized JSON + TXT report (pass/fail/partial per control).

---

## How Outputs Relate to Compliance Controls

- **73 OS-level controls** are mapped in `src/data/os-evidence-nist-manifest.json`. Each control lists required evidence files (paths relative to the bundle root). The validator checks file presence and, where defined, content rules (e.g. FIPS enabled, TLS 1.2 present, SMB1 disabled).

- **Seven Azure/Entra controls** (IA.L2-3.5.3–3.5.6, MA.L2-3.7.5, SC.L2-3.13.10, SC.L2-3.13.5) are supported by Azure/Entra evidence exports and optional attestation.

- **Pass/fail** is determined by script logic (e.g. Test-CuiHardening.ps1, validate_windows_server_hardening.py) and documented in **05_PASS_FAIL_LOGIC.md**.

---

## How Results Can Be Ingested into an Evidence Engine

- **Evidence bundle layout:** Each run produces a folder (e.g. `CUI-Evidence-<RunId>`) with subfolders `host/`, `policy/`, `audit/`, `network/`, `crypto/`, `defender/`, `storage/`, `apps/`, `azure/`, `meta/`. The `meta/` folder contains `manifest.json`, `hashes.sha256.txt`, and `collector.json`.

- **Validation report:** The validator outputs `validation-report-windows-hardening.json` (and `.txt`) with one entry per control: `control`, `pass`, `observed`, `expected`, `evidence_hint`, `evidence_files_used`, `provider_or_customer`, `layer`. An Evidence Engine can:
  - Ingest the validation JSON and map each `control` to its register/control ID.
  - Attach or reference the listed `evidence_files_used` (paths relative to bundle root).
  - Use `pass` / `partial` for status and `observed`/`expected` for display or remediation.

- **Integrity:** `meta/hashes.sha256.txt` and `meta/manifest.json` support integrity verification of the bundle before ingestion.

---

## Repository Layout (Relevant to This Package)

- **control-plane** (this repo): Validator (`scripts/validate_windows_server_hardening.py`), OS evidence manifest (`src/data/os-evidence-nist-manifest.json`), and governance/build scripts.
- **TRUST_CODEX** (sibling/parent repo): VM hardening and evidence scripts (`vm-scripts/*.ps1`), Azure/Entra collection and validation tools (`tools/*.sh`, `tools/*.py`).
- **evidence/runs** (when present): Full evidence runs with raw bundles (e.g. `evidence/runs/<RunId>/raw/CUI-Evidence-<RunId>/`). See **07_SAMPLE_OUTPUTS/** for structure.

---

*Generated for collector integration and external architectural review. Do not run scripts from this package; use the referenced repositories and paths.*
