# Collect-Cui-Evidence-v2 — Admin Integration Guide

**Script:** `Collect-Cui-Evidence-v2.ps1`  
**Requires:** Windows PowerShell 5.1, local Administrator rights  
**Produces:** A timestamped evidence bundle under `C:\CUI-Evidence\<run-id>\`

---

## What this script does

`Collect-Cui-Evidence-v2.ps1` snapshots the security configuration of a Windows Server VM and produces a structured evidence bundle that maps directly to NIST SP 800-171 Rev.2 / CMMC Level 2 controls.

It collects **only configuration artifacts** — it does not read, copy, or transmit any CUI data files. Evidence files remain on the VM. The only thing uploaded to the Trust Codex control plane is `meta\manifest.json`, which contains file paths and SHA-256 hashes.

### What gets collected

| Folder | Contents | CMMC Families |
|--------|----------|---------------|
| `policy\` | Group Policy (gpresult), local security policy (secedit), audit policy | AC, AU, CM |
| `host\` | OS info, services, scheduled tasks, startup programs, listening ports | CM, SI |
| `audit\` | Security event log (last 500 events), application/system logs | AU, IR |
| `network\` | Firewall rules (netsh advfirewall), IP config | SC |
| `defender\` | Windows Defender status, real-time protection, exclusions, scan history | SI |
| `crypto\` | Certificate store, BitLocker status | SC, MP |
| `storage\` | Disk info, shared folders | MP |
| `apps\` | Installed software (Win32_Product) | CM |
| `azure\` | Azure instance metadata, managed identity | SC, AC |
| `meta\` | `manifest.json` — file index with SHA-256 hashes + `bundle_validation` summary | (all) |

### What this script does NOT do

- Does **not** read, move, or transmit any CUI files
- Does **not** change system configuration (read-only collection)
- Does **not** require an internet connection
- Does **not** require Azure CLI or az login

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Windows PowerShell 5.1 | Built-in on Windows Server 2016/2019/2022/2025. Do **not** run in PowerShell 7 — use the `powershell.exe` host, not `pwsh.exe`. |
| Local Administrator | Required for event log access, secedit, auditpol, and WMI queries |
| `C:\CUI-Evidence\` writable | Script creates this directory if missing |
| Execution policy | Use `-ExecutionPolicy Bypass` — the script is unsigned |

---

## Step-by-step instructions

### Step 1 — Copy the script to the VM

Copy `Collect-Cui-Evidence-v2.ps1` to `C:\hardening\` on your Windows Server VM.  
(If using the MacTech CUI Vault, these scripts are pre-deployed.)

### Step 2 — Open PowerShell 5.1 as Administrator

- Press `Win + X`, choose **Windows PowerShell (Admin)**
- Or: right-click the Start menu → Terminal (Admin) → ensure the tab says `Windows PowerShell`
- Verify: `$PSVersionTable.PSVersion.Major` should return `5`

### Step 3 — Run the collector

```powershell
powershell.exe -ExecutionPolicy Bypass -File C:\hardening\Collect-Cui-Evidence-v2.ps1
```

The script takes 2–5 minutes. When complete, it prints:

```
[DONE] Bundle: C:\CUI-Evidence\<run-id>\
[DONE] Manifest: C:\CUI-Evidence\<run-id>\meta\manifest.json
Bundle validation: 71/73 files OK
```

### Step 4 — Retrieve manifest.json

1. Open `C:\CUI-Evidence\<run-id>\meta\`
2. Copy `manifest.json` to your local workstation (RDP clipboard, SCP, or USB)
3. Do **not** upload the full bundle — only `manifest.json` is needed

### Step 5 — Upload to Trust Codex

1. Log in to the Trust Codex control plane
2. Navigate to **Evidence → Upload Manifest**
3. Select your System Boundary
4. Drop `manifest.json` into the upload zone
5. Review the preview (run ID, computer name, file count)
6. Click **Ingest manifest**

The control plane maps each collected file to its corresponding CMMC controls and updates your adjudication progress automatically.

---

## Output structure

```
C:\CUI-Evidence\
  <run-id>\
    policy\
      gpresult-computer.txt
      gpresult-user.txt
      gpresult-html-export.txt    (HTML report)
      gpresult-xml-export.txt     (XML for parsing)
      gpresult-scope.txt
      secedit-export.txt          (local security policy)
      auditpol-config.txt         (audit policy categories)
      auditpol-subcategories.txt  (detailed subcategory list)
    host\
      os-info.txt
      services.txt
      scheduled-tasks.txt
      startup-programs.txt
      listening-processes.txt
    audit\
      security-events.txt
      application-log.txt
      system-log.txt
    network\
      firewall-rules.txt
      ip-config.txt
    defender\
      defender-status.txt
      defender-history.txt
    crypto\
      certificates.txt
      bitlocker-status.txt
    storage\
      disk-info.txt
      shared-folders.txt
    apps\
      installed-apps.txt
    azure\
      instance-metadata.txt
      managed-identity.txt
    meta\
      manifest.json               ← upload this file
```

### manifest.json format

```json
{
  "schema": "cui-evidence.manifest.v2",
  "run_id": "20250410T143022Z-abc12345",
  "collected_at": "2025-04-10T14:30:22.000Z",
  "computer_name": "MACTECH-CUI-VM",
  "files": [
    {
      "path": "policy/gpresult-computer.txt",
      "sha256": "e3b0c44298fc1c149afb...",
      "size_bytes": 4821,
      "collected_at": "2025-04-10T14:30:22.000Z",
      "status": "ok"
    },
    ...
  ],
  "bundle_validation": {
    "files_ok": 71,
    "files_total": 73,
    "errors": []
  }
}
```

Files with `"status": "collection_error"` were attempted but could not be gathered (e.g., BitLocker not enabled, Azure metadata not available). They are still linked to controls in the control plane but flagged as collection errors in the adjudication view.

---

## Troubleshooting

### "Access is denied" or WMI errors

Run PowerShell as a **local Administrator** (not just a domain admin — ensure local admin membership).

### gpresult shows "INFO: The user does not have RSoP data"

Normal for accounts without an active Group Policy session. The computer-scoped output (`gpresult /scope computer`) will still populate correctly. The user-scoped file will contain the info message — this is expected.

### secedit-export.txt is empty or missing secpol.cfg

`secedit.exe /export` requires a writable temp path. If `C:\Windows\Temp` is restricted, the export may fail. The script writes the stub to `policy\secedit-export.txt` with an error message.

### BitLocker status shows "not applicable"

BitLocker may not be enabled or may not apply to the OS volume. The crypto file is still created — the evidence shows the assessed state (not enabled), which maps to the control finding.

### Azure metadata returns "not available"

Expected if the VM does not have a managed identity assigned or is not running in Azure. The `azure\` files are created with the error output — assessors can see the attempted collection.

### "collection_error" files in the upload result

These are files the script could not gather (see above). They are ingested but flagged. Re-run the script after resolving the underlying issue (permissions, service not running, etc.), then upload the new manifest. Duplicate run IDs are rejected — each run produces a unique ID.

### Manifest upload rejected with "DUPLICATE_RUN"

Each run produces a unique `run_id`. If you are re-testing, run the script again to produce a new run ID. Old runs remain in the control plane for historical comparison.

### Script terminates early with a red error

Common causes:
1. Running in PowerShell 7 (`pwsh.exe`) instead of PowerShell 5.1 (`powershell.exe`)
2. Insufficient permissions — reopen as Administrator
3. Execution policy blocking the script — use `-ExecutionPolicy Bypass`

---

## Security considerations

| Concern | Response |
|---------|----------|
| What data leaves the VM? | Only `manifest.json` — file paths + SHA-256 hashes. No file contents. |
| Is manifest.json sensitive? | It reveals the presence/absence of configuration files (e.g., BitLocker not enabled). Treat it as internal/sensitive consistent with your data handling policy. |
| Can I verify the hashes? | Yes — SHA-256 hashes in the manifest can be independently recomputed from the bundle files to verify integrity. |
| Network access required? | No. Collection is entirely local. Only the upload step requires network access to the Trust Codex control plane. |
| Does the script persist anything? | It writes to `C:\CUI-Evidence\` only. No registry changes, no services installed, no scheduled tasks created. |

---

## Re-running and cadence

CMMC evidence is considered **current** for 180 days and **expired** after 365 days. The Trust Codex control plane tracks freshness automatically and shows an amber "Stale" badge at 180 days. Run the collector and upload a new manifest at least annually, or after any significant configuration change.

Recommended: run quarterly and upload the manifest after each hardening cycle.
