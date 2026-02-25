#!/usr/bin/env bash
# After Microsoft.KeyVault is Registered: create Key Vault (if needed), re-run Azure/Entra
# collect + validate, then document POA&M closeout for SC.L2-3.13.10.
# Run from repo root with: bash TRUST_CODEX/tools/complete_keyvault_poam_closeout.sh
# Requires: az login, AZURE_RG (default: rg-cui-pilot-envclave).

set -euo pipefail
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
TRUST_CODEX="${TRUST_CODEX:-$REPO_ROOT/TRUST_CODEX}"
AZURE_RG="${AZURE_RG:-rg-cui-pilot-envclave}"
KV_NAME="${KV_NAME:-codex-cui-kv-pilot}"
LOCATION="${LOCATION:-westus2}"

echo "=== 1. Check Microsoft.KeyVault provider ==="
state=$(az provider show --namespace Microsoft.KeyVault --query "registrationState" -o tsv 2>/dev/null || true)
if [ "$state" != "Registered" ]; then
  echo "Microsoft.KeyVault is not Registered (got: ${state:-unknown}). Run: az provider register --namespace Microsoft.KeyVault"
  echo "Then wait a few minutes and re-run this script."
  exit 1
fi
echo "Provider: Registered"

echo ""
echo "=== 2. Create Key Vault if not exists ==="
if az keyvault show --name "$KV_NAME" --resource-group "$AZURE_RG" -o none 2>/dev/null; then
  echo "Key Vault '$KV_NAME' already exists."
else
  echo "Creating Key Vault: $KV_NAME in $AZURE_RG ($LOCATION)"
  az keyvault create --name "$KV_NAME" --resource-group "$AZURE_RG" --location "$LOCATION" -o none
  echo "Created."
fi

echo ""
echo "=== 3. Collect Azure/Entra evidence (with Key Vault list) ==="
RUN_ID=$(date -u +%Y%m%d-%H%M%S)
OUT_DIR="$REPO_ROOT/evidence/runs/$RUN_ID/raw/azure"
mkdir -p "$OUT_DIR"
export RUN_ID OUT_DIR AZURE_RG TRUST_CODEX
bash "$TRUST_CODEX/tools/export_azure_evidence.sh"

echo ""
echo "=== 4. Validate Azure/Entra 7 controls ==="
VALID_DIR="$REPO_ROOT/evidence/runs/$RUN_ID/raw/CUI-Validation-AzureEntra-$RUN_ID"
mkdir -p "$VALID_DIR"
python3 "$TRUST_CODEX/tools/validate_azure_entra.py" \
  --artifact-dir "$OUT_DIR" \
  --out-dir "$VALID_DIR"

echo ""
echo "=== 5. Check AZ-KEYVAULT (SC.L2-3.13.10) ==="
if grep -q 'AZ-KEYVAULT.*PASS\|SC.L2-3.13.10.*PASS' "$VALID_DIR/validation-report-azure-entra.txt" 2>/dev/null; then
  echo "PASS: SC.L2-3.13.10 (Cryptographic key management) — Key Vault evidence present."
  echo ""
  echo "=== POA&M closeout for SC.L2-3.13.10 ==="
  echo "1. Open the Trust Codex Manual (manual app)."
  echo "2. Go to the POA&M tab."
  echo "3. Find the row for SC.L2-3.13.10 (Cryptographic key management)."
  echo "4. Click 'Complete' to mark the POA&M item complete."
  echo "5. In the Controls tab, adjudicate SC.L2-3.13.10 (attach evidence ref: $OUT_DIR or validation report)."
  echo ""
  echo "Evidence run: $RUN_ID"
  echo "  Artifacts: $OUT_DIR"
  echo "  Validation: $VALID_DIR/validation-report-azure-entra.txt"
  # Write closeout note into the run
  CLOSEOUT="$REPO_ROOT/evidence/runs/$RUN_ID/SC.L2-3.13.10-POAM-CLOSEOUT.md"
  cat > "$CLOSEOUT" << EOF
# SC.L2-3.13.10 POA&M closeout

- **Run ID:** $RUN_ID
- **Control:** SC.L2-3.13.10 (Cryptographic key management)
- **Result:** Validator AZ-KEYVAULT PASS (keyvault-list.json non-empty).
- **Evidence:** \`raw/azure/keyvault-list.json\`, \`raw/CUI-Validation-AzureEntra-$RUN_ID/validation-report-azure-entra.txt\`.

**Manual steps:** In the Trust Codex Manual, POA&M tab, mark SC.L2-3.13.10 as **Complete**. Then adjudicate the control in the Controls tab with evidence ref to this run.
EOF
  echo "Closeout note written: $CLOSEOUT"
else
  echo "FAIL or not found: AZ-KEYVAULT. Check $VALID_DIR/validation-report-azure-entra.txt"
  exit 1
fi
