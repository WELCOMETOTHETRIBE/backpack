# VM scripts (pilot) — hardening, evidence collection, validation

These PowerShell scripts are the **productizable** building blocks for the Windows Server 2025 pilot VM:

- `Invoke-CuiHardening.ps1`: **idempotent** hardening actions (writes a log of changes). Default parameters set RDP session limits (AC.L2-3.1.11): 15 min idle, 5 min disconnect (session ended → re-auth on reconnect), 8 h max connection.
- `Collect-Cui-Evidence.ps1`: generates a timestamped evidence bundle under `C:\evidence\...` and zips it
- `Test-CuiHardening.ps1`: **read-only validation**; outputs PASS/FAIL checks and a JSON report (does not change configuration)
- `Set-CuiLoginBannerAndWallpaper.ps1`: **branding + warning banner** (changes configuration; intended for authorized admins under change control)
- `Set-RdpNla.ps1`: **one-off RDP NLA fix** (sets UserAuthentication=1 for AC.L2-3.1.3; run when full hardening is not desired)
- **Continuous Drift Guard:** `Set-DriftGuardBaseline.ps1` (set baseline from latest validation run), `Run-DriftGuardCheck.ps1` (run evidence + validation and update last check). Used by the Trust Codex Manual **Drift Guard** tab to detect configuration drift (regressions: checks that were PASS and are now FAIL).

### Azure/Entra 7-control flow (IA.L2-3.5.x, MA.L2-3.7.5, SC.L2-3.13.x)

- `Invoke-AzureEntra7Hardening.ps1`: **Optional.** Hardens the 2 fixable-via-CLI controls: creates a Key Vault if none exist; adds an NSG Deny rule for RDP from 0.0.0.0/0 if an Allow exists. Requires `-ResourceGroup` and `-Apply` to make changes. Uses Azure CLI (`az`).
- `Collect-AzureEntraEvidence.ps1`: Collects role assignments, sign-in list, NSG list/rules (if `-ResourceGroup`), Key Vault list. Writes to `CUI-AzureEntra-<RunId>\` or into `CUI-Evidence-<RunId>\azure-entra\`.
- `Test-AzureEntraControls.ps1`: Validates the 7 controls from collected artifacts; writes `validation-report-azure-entra.txt` and `.json`.
- **One command (harden → collect → validate):**  
  `.\Run-AzureEntraCollectAndValidate.ps1 -OutRoot C:\evidence -ResourceGroup <your-rg> -RunHardening`  
  Without `-RunHardening` it only collects and validates. Set `$env:AZURE_RG` instead of `-ResourceGroup` if preferred.

## Important operating rules

- These scripts are intended to support **Class A** (system-enforced) controls by producing **verifiable, reproducible technical evidence**.
- Running `Invoke-CuiHardening.ps1` changes system configuration; it should be executed only by authorized administrators under change control.
- This repo does **not** auto-apply any configuration. It only documents and provides tooling.

## Deployment guidance (pilot)

Copy scripts to the VM:
- `C:\hardening\`

Then run (examples):

```powershell
powershell -ExecutionPolicy Bypass -File C:\hardening\Invoke-CuiHardening.ps1
powershell -ExecutionPolicy Bypass -File C:\hardening\Test-CuiHardening.ps1
powershell -ExecutionPolicy Bypass -File C:\hardening\Collect-Cui-Evidence.ps1
powershell -ExecutionPolicy Bypass -File C:\hardening\Set-CuiLoginBannerAndWallpaper.ps1
# One-off RDP NLA fix (AC.L2-3.1.3) without full hardening:
powershell -ExecutionPolicy Bypass -File C:\hardening\Set-RdpNla.ps1
```

