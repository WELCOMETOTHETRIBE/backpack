# Data Dictionary

Fields and structures used in evidence and validation outputs. All paths are relative to the evidence bundle root unless noted.

---

## Validation Report (validate_windows_server_hardening.py)

**Files:** `validation-report-windows-hardening.json`, `validation-report-windows-hardening.txt`

### Root object

| Field | Type | Description |
|-------|------|-------------|
| validator | object | Validator metadata |
| manifest_metadata | object | Manifest path and control count |
| summary | object | Counts of passed, partial, failed |
| inputs | array | List of input file metadata (filename, sha256, size, mtime_utc) |
| checks | array | One object per control (see below) |

### validator

| Field | Type | Description |
|-------|------|-------------|
| name | string | "validate_windows_server_hardening" |
| version | string | Semantic version |
| sha256 | string | SHA-256 of validator script |

### summary

| Field | Type | Description |
|-------|------|-------------|
| total_controls | number | Total checks (e.g. 73) |
| passed | number | Count of pass=true |
| partial | number | Count of partial=true |
| failed | number | Count of pass=false |

### checks[] (each element)

| Field | Type | Description |
|-------|------|-------------|
| control | string | Control ID (e.g. "AU.L2-3.3.1", "BUNDLE.INTEGRITY") |
| pass | boolean | true = PASS, false = FAIL |
| observed | string | What was observed (truncated in JSON) |
| expected | string | What was expected |
| evidence_hint | string | Remediation / where to look |
| evidence_files_used | string[] | Sorted list of evidence file paths used |
| provider_or_customer | string | "customer" \| "provider" \| "shared" |
| layer | string \| null | Ontology layer (e.g. "Logging/Collection") or null |
| partial | boolean | Optional; true if support_level is PARTIAL and check passed |
| details | object | Optional; e.g. BUNDLE.INTEGRITY hash details |

---

## In-VM Validation Report (Test-CuiHardening.ps1)

**Files:** `report.json`, `report.txt`

### checks[] (each element)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Check identifier (e.g. "CRYPTO-FIPS", "NET-FW") |
| control | string | CMMC/NIST control ID |
| title | string | Short title |
| pass | boolean | true = PASS, false = FAIL |
| observed | string | Observed value or error |
| expected | string | Expected condition |
| evidence_hint | string | File or command to review |
| timestamp_utc | string | ISO 8601 UTC |

---

## Bundle Manifest (meta/manifest.json)

**Produced by:** Collect-Cui-Evidence-v2.ps1

| Field | Type | Description |
|-------|------|-------------|
| schema | string | "cui-evidence.manifest.v2" |
| run_id | string | Run identifier |
| collected_at | string | ISO 8601 |
| computer_name | string | Host name |
| user | string | Domain\\user |
| is_admin | boolean | Collector ran as admin |
| bundle_root | string | Full path to bundle (on collector host) |
| files | array | One entry per file (path, sha256, size_bytes, collected_at) |
| command_results | array | Per-command result (name, file, ok, error) |
| warnings | array | Collector warnings |

### files[] element

| Field | Type | Description |
|-------|------|-------------|
| path | string | Relative path (forward slashes) |
| sha256 | string | SHA-256 hash |
| size_bytes | number | File size |
| collected_at | string | ISO 8601 |

---

## Collector Metadata (meta/collector.json)

| Field | Type | Description |
|-------|------|-------------|
| name | string | "Collect-Cui-Evidence-v2" |
| version | string | e.g. "2.0.0" |
| collected_at | string | ISO 8601 |
| run_id | string | Run identifier |
| out_root | string | Output root path |
| powershell_version | string | PS version |
| host | object | computer_name, user, user_domain, is_admin |

---

## Hashes (meta/hashes.sha256.txt)

- Format: one line per file: `<sha256>  <relative_path>` (space-separated, forward slashes in path).
- Covers every file under the bundle root (excluding .zip in parent).

---

## Control Mapping Stub (meta/control-mapping.stub.json)

| Field | Type | Description |
|-------|------|-------------|
| schema | string | "control-mapping.v1" |
| generated_at | string | ISO 8601 |
| notes | string | Human note |
| files | array | { file, controls[] } for a subset of files |

---

## Azure/Entra Manifest (Azure evidence folder)

| Field | Type | Description |
|-------|------|-------------|
| run_id | string | Run identifier |
| out_dir | string | Output directory |
| collected_utc | string | ISO 8601 |
| controls | array | Control IDs (e.g. IA.L2-3.5.3, SC.L2-3.13.10) |
| artifacts | object | Map of artifact filename to path |
| azure_resource_group | string | Optional; resource group for NSG |

---

## OS Evidence Manifest (src/data/os-evidence-nist-manifest.json)

Reference only; not produced by collectors.

| Field | Type | Description |
|-------|------|-------------|
| control_id | string | e.g. "AC.L2-3.1.1" |
| nist_req | string | e.g. "3.1.1" |
| title | string | Control title |
| support_level | string | "STRONG" \| "PARTIAL" |
| evidence_files | string[] | Relative paths required for this control |

---

## Evidence Engine Ingestion

For ingestion into an Evidence Engine, the following are typically used:

- **control** — map to register/control ID in the engine.
- **pass** / **partial** — status (e.g. pass, partial, fail).
- **observed** / **expected** — display or remediation text.
- **evidence_files_used** — attach or link evidence files (paths relative to bundle root).
- **provider_or_customer** / **layer** — responsibility and layer for reporting.

Integrity of the bundle can be verified using `meta/hashes.sha256.txt` and `meta/manifest.json` before processing.
