# Pull Trust Codex Manual Into the VM (from within the VM)

This runbook describes how to get **everything needed from the Trust Codex Manual** onto the enclave VM and deploy it to the standard paths (`C:\hardening\codex-scripts`, `C:\evidence`) so hardening, evidence collection, validation, and the auditor-facing manual are all available **from within the VM**.

---

## What gets deployed

| Source (in TRUST_CODEX) | Destination on VM |
|-------------------------|-------------------|
| `vm-scripts\*` | `C:\hardening\codex-scripts\` (Invoke-CuiHardening.ps1, Collect-Cui-Evidence.ps1, Test-CuiHardening.ps1, Run-CuiBulkEvidenceAndValidate.ps1, JSON configs, etc.) |
| `vm-scripts\README-for-auditor.txt` | `C:\evidence\README-for-auditor.txt` |
| `_build\CODEX_VIEWER.html` | `C:\evidence\CODEX_VIEWER.html` |
| Optional: `manual_app\*` | `C:\evidence\manual\` (Auditor Manual; use `-DeployManual`) |

After deployment you can run evidence + validation from the VM with:

```powershell
& C:\hardening\codex-scripts\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence
```

The auditor is shown **`C:\evidence\`**: latest `CUI-Evidence-<RunId>`, `CUI-Validation-<RunId>`, `CODEX_VIEWER.html`, and `README-for-auditor.txt`. See [AUDITOR_VIEW_ON_VM.md](AUDITOR_VIEW_ON_VM.md).

---

## Step 1: Get Trust Codex onto the VM

Use **one** of these methods.

### Option A — Push from your machine (recommended if you have SSH)

From a machine that has the repo and SSH access to the VM:

```bash
# Set VM connection (and optional key)
export TRUST_CODEX_VM_HOST=your-vm-ip
export TRUST_CODEX_VM_USER=your-vm-user
export TRUST_CODEX_SSH_KEY=~/.ssh/your-key

# Push build + full Codex to C:\Codex\TRUST_CODEX and C:\evidence
./tools/push_build_to_vm.sh
```

This puts `manual_app`, `vm-scripts`, `_build`, `tables`, `docs`, and optionally `governance` under `C:\Codex\TRUST_CODEX` on the VM, and copies CODEX_VIEWER.html and README-for-auditor to `C:\evidence\`. Then **on the VM** run Step 2 with `-CodexPath "C:\Codex\TRUST_CODEX"` to sync `vm-scripts` to `C:\hardening\codex-scripts` and refresh `C:\evidence\` files.

### Option B — Git clone on the VM

If the VM has Git and network access to the repo:

1. On the VM, open PowerShell (e.g. Run as Administrator if you need to create `C:\Codex`).
2. Create a folder and clone:

   ```powershell
   New-Item -ItemType Directory -Path "C:\Codex" -Force
   cd C:\Codex
   git clone --depth 1 https://github.com/YourOrg/cui-pilot.git
   # If the repo root contains TRUST_CODEX as a subfolder:
   $CodexPath = "C:\Codex\cui-pilot\TRUST_CODEX"
   ```

3. If your repo structure is different, set `$CodexPath` to the path of the **TRUST_CODEX** folder (the one that contains `vm-scripts`, `_build`, `chapters`, `tables`, etc.).
4. Go to Step 2 and run `Deploy-TrustCodexToVM.ps1 -CodexPath $CodexPath`.

### Option C — Copy from network share or USB

1. Copy the **TRUST_CODEX** folder (or the whole repo that contains it) onto the VM, e.g. to `C:\Codex\TRUST_CODEX` or `D:\TRUST_CODEX`.
2. Ensure it contains at least:
   - `vm-scripts\` (with Invoke-CuiHardening.ps1, Collect-Cui-Evidence.ps1, Test-CuiHardening.ps1, Run-CuiBulkEvidenceAndValidate.ps1, README-for-auditor.txt, JSON files)
   - `_build\CODEX_VIEWER.html`
3. Go to Step 2.

---

## Step 2: Run the deploy script on the VM

From **within the VM**, in PowerShell:

```powershell
# Replace with the actual path where TRUST_CODEX lives on the VM
$CodexPath = "C:\Codex\TRUST_CODEX"   # or \\server\share\TRUST_CODEX, D:\TRUST_CODEX, etc.

# Deploy scripts + evidence folder assets (required)
& "$CodexPath\vm-scripts\Deploy-TrustCodexToVM.ps1" -CodexPath $CodexPath

# Optional: also deploy manual_app to C:\evidence\manual\
& "$CodexPath\vm-scripts\Deploy-TrustCodexToVM.ps1" -CodexPath $CodexPath -DeployManual
```

This copies:

- All of `vm-scripts` to `C:\hardening\codex-scripts\`
- `README-for-auditor.txt` to `C:\evidence\`
- `CODEX_VIEWER.html` to `C:\evidence\`
- With `-DeployManual`: `manual_app` to `C:\evidence\manual\`

---

## Step 3: Generate evidence (after deployment)

On the VM:

```powershell
& C:\hardening\codex-scripts\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence
```

Then point the auditor to **`C:\evidence\`** and the latest `CUI-Evidence-<RunId>` and `CUI-Validation-<RunId>` (see [AUDITOR_VIEW_ON_VM.md](AUDITOR_VIEW_ON_VM.md)).

---

## Summary

| Step | Action |
|------|--------|
| 1 | Get Trust Codex onto the VM (push from host, git clone, or copy from share/USB). |
| 2 | On the VM: run `Deploy-TrustCodexToVM.ps1 -CodexPath <path-to-TRUST_CODEX>` (and `-DeployManual` if you want the manual app in `C:\evidence\manual`). |
| 3 | On the VM: run `Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence`. Show auditor `C:\evidence\`. |

All Trust Codex Manual assets needed for hardening, evidence, validation, and assessor review are then available from within the VM.
