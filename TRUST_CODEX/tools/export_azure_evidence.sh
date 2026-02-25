#!/usr/bin/env bash
# Export Azure/Entra evidence per EVIDENCE_RUNBOOK.md (role assignments, NSG rules).
# Run from repo root or set TRUST_CODEX; OUT_DIR defaults to evidence/runs/<RunId>/azure.
# Requires: az (Azure CLI) logged in.

set -euo pipefail

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
OUT_DIR="${OUT_DIR:-$TRUST_CODEX/../evidence/runs/$RUN_ID/azure}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "RunId: $RUN_ID"
echo "OutDir: $OUT_DIR"

if ! command -v az &>/dev/null; then
  echo "Azure CLI (az) not found. Writing placeholder and exit."
  echo "Run this script on a machine with 'az login' to collect role assignments and NSG rules." > README.txt
  exit 0
fi

# Role assignments (subscription and common scopes)
echo "Exporting role assignments..."
az role assignment list --all -o json > role-assignments-all.json 2>/dev/null || echo "[]" > role-assignments-all.json
az role assignment list --all -o table > role-assignments-all.txt 2>/dev/null || true

# NSG list and rules (if resource group or NSG name provided)
if [[ -n "${AZURE_RG:-}" ]]; then
  echo "Exporting NSGs in RG: $AZURE_RG"
  az network nsg list -g "$AZURE_RG" -o json > nsg-list.json 2>/dev/null || echo "[]" > nsg-list.json
  az network nsg list -g "$AZURE_RG" -o table > nsg-list.txt 2>/dev/null || true
  for nsg in $(az network nsg list -g "$AZURE_RG" --query "[].name" -o tsv 2>/dev/null); do
    safe=$(echo "$nsg" | tr -cd '[:alnum:]_-')
    az network nsg rule list --nsg-name "$nsg" --resource-group "$AZURE_RG" -o json > "nsg-rules-$safe.json" 2>/dev/null || true
    az network nsg rule list --nsg-name "$nsg" --resource-group "$AZURE_RG" -o table > "nsg-rules-$safe.txt" 2>/dev/null || true
  done
fi

# Optional: sign-in list (requires az ad signin list - may need preview)
echo "Exporting Entra sign-in list..."
az ad signin list --top 500 -o json > entra-signin.json 2>/dev/null || echo "[]" > entra-signin.json
az ad signin list --top 500 -o table > entra-signin.txt 2>/dev/null || true

# Conditional Access policies (IA 3.5.3, 3.5.4–3.5.6, MA 3.7.5 — via Microsoft Graph)
echo "Exporting Conditional Access policies (Graph)..."
GRAPH_TOKEN=$(az account get-access-token --resource 00000003-0000-0000-c000-000000000000 --query accessToken -o tsv 2>/dev/null) || true
if [[ -n "$GRAPH_TOKEN" ]]; then
  curl -sS -H "Authorization: Bearer $GRAPH_TOKEN" "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o conditional-access-policies.json 2>/dev/null || true
fi
if [[ ! -s conditional-access-policies.json ]]; then
  echo '{"value":[]}' > conditional-access-policies.json
fi

# Key Vault list (SC.L2-3.13.10 - cryptographic key management)
echo "Exporting Key Vault list..."
az keyvault list -o json > keyvault-list.json 2>/dev/null || echo "[]" > keyvault-list.json

# Key Vault access policies (SC.L2-3.13.10 hardening — see docs/SC_L2_3_13_10_Key_Management_Narrative.md)
if [[ -s keyvault-list.json ]] && jq -e 'length > 0' keyvault-list.json >/dev/null 2>&1; then
  for kv_name in $(jq -r '.[].name' keyvault-list.json 2>/dev/null); do
    [[ -z "$kv_name" ]] && continue
    safe=$(echo "$kv_name" | tr -cd '[:alnum:]_-')
    echo "Exporting Key Vault access policy: $kv_name"
    az keyvault show --name "$kv_name" --query "properties.accessPolicies" -o json > "keyvault-${safe}-access-policies.json" 2>/dev/null || true
    kv_id=$(az keyvault show --name "$kv_name" --query id -o tsv 2>/dev/null)
    if [[ -n "$kv_id" ]]; then
      az role assignment list --scope "$kv_id" -o json > "keyvault-${safe}-role-assignments.json" 2>/dev/null || echo "[]" > "keyvault-${safe}-role-assignments.json"
    fi
  done
fi

# Manifest for validator
manifest_path="$OUT_DIR/manifest.json"
printf '%s\n' "{\"run_id\":\"$RUN_ID\",\"out_dir\":\"$OUT_DIR\",\"collected_utc\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"controls\":[\"IA.L2-3.5.3\",\"IA.L2-3.5.4\",\"IA.L2-3.5.5\",\"IA.L2-3.5.6\",\"MA.L2-3.7.5\",\"SC.L2-3.13.10\",\"SC.L2-3.13.5\"],\"artifacts\":{}}" > "$manifest_path"

echo "Done. Artifacts in $OUT_DIR"
