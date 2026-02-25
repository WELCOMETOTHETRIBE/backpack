# Run 20260212-082125 — VM evidence (run on enclave)

Run these on the **enclave VM** (VPN + RDP) where Codex scripts are installed (e.g. C:\hardening\codex-scripts\).

## 1. Collect evidence + validate

PowerShell (elevated if needed):

```powershell
cd C:\hardening\codex-scripts
.\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence
```

This creates:
- `C:\evidence\CUI-Evidence-20260212-082125\` (or the RunId generated on the VM)
- `C:\evidence\CUI-Validation-<RunId>\`

## 2. Copy to this run (or sync to vault)

Copy the VM output into this run:

- From VM: `C:\evidence\CUI-Evidence-<RunId>\` → here: `/Users/patrick/cui-pilot/evidence/runs/20260212-082125/raw/CUI-Evidence-<RunId>/`
- Or use vault sync: `TRUST_CODEX/vault/Sync-EvidenceToVault.ps1` (from a machine that can reach \\EvidenceVault\CUI-Enclave)

## 3. Entra sign-in logs (if not using az ad signin list)

Azure portal → Microsoft Entra ID → Monitoring → Sign-in logs → Export (CSV). Save to this run as `raw/azure/entra-signin-<date>.csv`.
