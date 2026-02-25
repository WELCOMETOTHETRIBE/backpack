# Azure/Entra 7-Controls — Evidence for 4 PASS

**Run ID:** 20260214-211311  
**Validation report:** `../CUI-Validation-AzureEntra-20260214-211311/validation-report-azure-entra.txt`

## Result: 4 PASS, 3 FAIL

### PASS (evidence in this folder)

| Control | Title | Evidence artifact(s) |
|---------|--------|------------------------|
| **IA.L2-3.5.4** | Replay-resistant authentication | `role-assignments-all.json` (Entra/role evidence) |
| **IA.L2-3.5.5** | Prevent identifier reuse | `role-assignments-all.json` |
| **IA.L2-3.5.6** | Disable identifiers after inactivity | `role-assignments-all.json` |
| **SC.L2-3.13.5** | Implement subnetworks (NSG) | `nsg-list.json`, `nsg-rules-nsg-cui-pilot.json` (NSG present; RDP from 0.0.0.0/0 denied by priority-100 rule) |

### FAIL (not yet satisfied)

- **IA.L2-3.5.3, MA.L2-3.7.5** — MFA: need non-empty `entra-signin.json` and/or Conditional Access export (portal or Graph).
- **SC.L2-3.13.10** — Key management: need non-empty `keyvault-list.json` (register subscription for Microsoft.KeyVault and create a vault, or add alternate evidence path in validator).

### Artifact list (this run)

- `role-assignments-all.json` / `.txt`
- `nsg-list.json` / `.txt`
- `nsg-rules-nsg-cui-pilot.json` / `.txt`
- `entra-signin.json` (empty)
- `keyvault-list.json` (empty)
- `manifest.json`

### VM workflow (harden + collect + validate)

On the VM (with Azure CLI and `az login`):

```powershell
$env:AZURE_RG = "rg-cui-pilot-envclave"   # or your NSG resource group
.\Run-AzureEntraCollectAndValidate.ps1 -OutRoot C:\evidence -RunHardening
```

This runs `Invoke-AzureEntra7Hardening.ps1 -Apply`, then collect, then validate.
