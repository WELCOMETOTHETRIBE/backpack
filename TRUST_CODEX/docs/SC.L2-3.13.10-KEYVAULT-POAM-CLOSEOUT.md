# SC.L2-3.13.10 (Cryptographic key management) — Key Vault and POA&M closeout

## Status: Key Vault created and validated (5 PASS)

- **Run 20260214-212759:** Key Vault `codex-cui-kv-pilot` created; Azure/Entra collect + validate run; **AZ-KEYVAULT PASS**. POA&M closeout note: `evidence/runs/20260214-212759/SC.L2-3.13.10-POAM-CLOSEOUT.md`. Complete the POA&M item in the Manual (POA&M tab → SC.L2-3.13.10 → Complete).

---

## What was done

1. **Microsoft.KeyVault provider registration** was started from the Azure CLI:
   ```bash
   az provider register --namespace Microsoft.KeyVault
   ```
   Registration can take **several minutes** (often 5–15). Check status:
   ```bash
   az provider show --namespace Microsoft.KeyVault --query "registrationState" -o tsv
   ```
   When this returns `Registered`, proceed.

2. **Finish script** (run from repo root after provider is Registered):
   ```bash
   bash TRUST_CODEX/tools/complete_keyvault_poam_closeout.sh
   ```
   The script will:
   - Verify Microsoft.KeyVault is Registered
   - Create Key Vault `codex-cui-kv-pilot` in `rg-cui-pilot-envclave` if it does not exist (override with `KV_NAME`, `AZURE_RG`, `LOCATION` if needed)
   - Run Azure/Entra evidence collection (role assignments, NSG, **Key Vault list**, sign-in)
   - Run Azure/Entra validation
   - If AZ-KEYVAULT (SC.L2-3.13.10) **PASS**, print POA&M closeout steps and write a closeout note under `evidence/runs/<RunId>/SC.L2-3.13.10-POAM-CLOSEOUT.md`

3. **Close the POA&M in the Manual**
   - Open the Trust Codex Manual (manual app).
   - Go to the **POA&M** tab.
   - Find **SC.L2-3.13.10** (Cryptographic key management).
   - Click **Complete** to mark the item complete.
   - Optionally: in the **Controls** tab, adjudicate SC.L2-3.13.10 and attach the evidence run path (e.g. `evidence/runs/<RunId>/raw/azure` and validation report).

## One-off commands (if you prefer not to use the script)

After `az provider show --namespace Microsoft.KeyVault` returns `Registered`:

```bash
# Create Key Vault
az keyvault create --name codex-cui-kv-pilot --resource-group rg-cui-pilot-envclave --location westus2

# Collect (from repo root)
export RUN_ID=$(date -u +%Y%m%d-%H%M%S)
export OUT_DIR="$(pwd)/evidence/runs/$RUN_ID/raw/azure"
export AZURE_RG=rg-cui-pilot-envclave
mkdir -p "$OUT_DIR"
bash TRUST_CODEX/tools/export_azure_evidence.sh

# Validate
python3 TRUST_CODEX/tools/validate_azure_entra.py --artifact-dir "$OUT_DIR" --out-dir "evidence/runs/$RUN_ID/raw/CUI-Validation-AzureEntra-$RUN_ID"
```

Then in the Manual: POA&M tab → SC.L2-3.13.10 → **Complete**.

## References

- POA&M item: SC.L2-3.13.10 (Cryptographic key management) — tasks and closeout steps are in the Manual POA&M tab.
- Evidence runbook: TRUST_CODEX/docs/EVIDENCE_RUNBOOK.md §5a (Azure/Entra 7-control module).
- Validator: AZ-KEYVAULT check in `validate_azure_entra.py` and `Test-AzureEntraControls.ps1` (PASS when `keyvault-list.json` is non-empty).
