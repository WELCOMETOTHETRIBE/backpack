#!/usr/bin/env bash
# Export Azure/Entra evidence for CMMC L2 / NIST 800-171 (C3PAO assessment).
# Per EVIDENCE_RUNBOOK.md. Produces role assignments, NSG list+rules, Entra
# sign-in, Conditional Access, Entra audit log, Key Vault list+properties,
# and Storage Account list for the 12 Azure/Entra controls validated by
# tools/validate_azure_entra.py v1.4+ (3.1.13, 3.1.14, 3.5.3, 3.5.4, 3.5.5,
# 3.5.6, 3.7.5, 3.3.1, 3.3.2, 3.13.5, 3.13.8, 3.13.10).
#
# OUT_DIR defaults to evidence/runs/<RunId>/raw/azure. Set AZURE_RG to your enclave
# resource group for NSG rule export (default: rg-cui-pilot-envclave). Requires: az, jq.

set -euo pipefail

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
OUT_DIR="${OUT_DIR:-$TRUST_CODEX/../evidence/runs/$RUN_ID/raw/azure}"
AZURE_RG="${AZURE_RG:-rg-cui-pilot-envclave}"

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

echo "RunId: $RUN_ID"
echo "OutDir: $OUT_DIR"
echo "Azure RG: $AZURE_RG"

if ! command -v az &>/dev/null; then
  echo "Azure CLI (az) not found. Writing placeholder and exit."
  echo "Run this script on a machine with 'az login' to collect evidence for C3PAO." > README.txt
  exit 0
fi

# Role assignments (subscription and common scopes)
echo "Exporting role assignments..."
az role assignment list --all -o json > role-assignments-all.json 2>/dev/null || echo "[]" > role-assignments-all.json
az role assignment list --all -o table > role-assignments-all.txt 2>/dev/null || true

# NSG list and rules (SC.L2-3.13.5 — AZ-NSG). C3PAO: always export rules for validator.
echo "Exporting NSG list and rules..."
az network nsg list -g "$AZURE_RG" -o json > nsg-list.json 2>/dev/null || echo "[]" > nsg-list.json
az network nsg list -g "$AZURE_RG" -o table > nsg-list.txt 2>/dev/null || true
# Always export rules per NSG so validator can evaluate RDP from public (C3PAO evidence).
for nsg in $(az network nsg list -g "$AZURE_RG" --query "[].name" -o tsv 2>/dev/null); do
  [[ -z "$nsg" ]] && continue
  safe=$(echo "$nsg" | tr -cd '[:alnum:]_-')
  az network nsg rule list --nsg-name "$nsg" --resource-group "$AZURE_RG" -o json > "nsg-rules-$safe.json" 2>/dev/null || true
  az network nsg rule list --nsg-name "$nsg" --resource-group "$AZURE_RG" -o table > "nsg-rules-$safe.txt" 2>/dev/null || true
done
# Fallback: if no rules exported (e.g. RG empty), try subscription-wide NSG list and export rules via jq
if ! compgen -G "nsg-rules-*.json" >/dev/null 2>&1 && command -v jq &>/dev/null; then
  if ! jq -e 'length > 0' nsg-list.json >/dev/null 2>&1; then
    az network nsg list -o json > nsg-list.json 2>/dev/null || echo "[]" > nsg-list.json
  fi
  if jq -e 'length > 0' nsg-list.json >/dev/null 2>&1; then
    while IFS= read -r line; do
      nsg=$(echo "$line" | cut -f1 -d' ')
      rg=$(echo "$line" | cut -f2 -d' ')
      [[ -z "$nsg" || -z "$rg" ]] && continue
      safe=$(echo "$nsg" | tr -cd '[:alnum:]_-')
      az network nsg rule list --nsg-name "$nsg" --resource-group "$rg" -o json > "nsg-rules-$safe.json" 2>/dev/null || true
    done < <(jq -r '.[] | "\(.name) \(.resourceGroup)"' nsg-list.json 2>/dev/null || true)
  fi
fi

# Sign-in list via Microsoft Graph (no native `az` command exists for this — the
# previous `az ad signin list` invocation was a no-op typo). Requires (a) Audit
# Logs Reader role on the executing principal AND (b) Entra ID P1 or P2 licensing
# on the tenant. Non-Premium tenants get HTTP 403 ("Tenant is not a B2C tenant
# and doesn't have premium license") — we write [] and let the customer flip
# 3.3.2/3.3.1 via the unique-traceability-attested.txt fallback documented in
# validate_azure_entra.py.
echo "Exporting Entra sign-in list..."
az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$top=500" \
  --query "value" -o json > entra-signin.json 2>/dev/null \
  || echo "[]" > entra-signin.json
if [[ -s entra-signin.json ]] && [[ "$(jq 'length' entra-signin.json 2>/dev/null)" != "0" ]]; then
  jq -r '.[] | [.createdDateTime, .userPrincipalName, .appDisplayName, .ipAddress] | @tsv' \
    entra-signin.json > entra-signin.txt 2>/dev/null || true
else
  echo "(no sign-in entries returned — tenant likely not Entra ID Premium)" > entra-signin.txt
fi

# Conditional Access policies (IA 3.5.3, 3.5.4–3.5.6, MA 3.7.5 — via Microsoft Graph)
echo "Exporting Conditional Access policies (Graph)..."
GRAPH_TOKEN=$(az account get-access-token --resource 00000003-0000-0000-c000-000000000000 --query accessToken -o tsv 2>/dev/null) || true
if [[ -n "$GRAPH_TOKEN" ]]; then
  curl -sS -H "Authorization: Bearer $GRAPH_TOKEN" "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o conditional-access-policies.json 2>/dev/null || true
fi
if [[ ! -s conditional-access-policies.json ]]; then
  echo '{"value":[]}' > conditional-access-policies.json
fi

# Storage Account list (SC.L2-3.13.8 — TLS for CUI in transit). Validator v1.4+
# inspects each account's enableHttpsTrafficOnly + minimumTlsVersion fields.
echo "Exporting Storage Account list..."
az storage account list -o json > storage-account-list.json 2>/dev/null || echo "[]" > storage-account-list.json
az storage account list -o table > storage-account-list.txt 2>/dev/null || true

# Entra audit log (AU.L2-3.3.1 — explicit audit-log presence beyond sign-ins).
# Best-effort; requires Audit Logs Reader on the executing principal. Falls
# back to placeholder when the CLI/Graph permission isn't granted.
echo "Exporting Entra audit log (best-effort)..."
if [[ -n "$GRAPH_TOKEN" ]]; then
  curl -sS -H "Authorization: Bearer $GRAPH_TOKEN" \
    "https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?\$top=500" \
    -o entra-audit-log.json 2>/dev/null || true
fi
if [[ ! -s entra-audit-log.json ]]; then
  echo '{"value":[]}' > entra-audit-log.json
fi

# Key Vault list (SC.L2-3.13.10 - cryptographic key management)
echo "Exporting Key Vault list..."
az keyvault list -o json > keyvault-list.json 2>/dev/null || echo "[]" > keyvault-list.json

# Key Vault access policies and full properties (SC.L2-3.13.10 — soft delete, purge protection, RBAC for validator)
if [[ -s keyvault-list.json ]] && jq -e 'length > 0' keyvault-list.json >/dev/null 2>&1; then
  for kv_name in $(jq -r '.[].name' keyvault-list.json 2>/dev/null); do
    [[ -z "$kv_name" ]] && continue
    safe=$(echo "$kv_name" | tr -cd '[:alnum:]_-')
    echo "Exporting Key Vault properties and access policy: $kv_name"
    az keyvault show --name "$kv_name" -o json > "keyvault-${safe}-properties.json" 2>/dev/null || true
    az keyvault show --name "$kv_name" --query "properties.accessPolicies" -o json > "keyvault-${safe}-access-policies.json" 2>/dev/null || true
    kv_id=$(az keyvault show --name "$kv_name" --query id -o tsv 2>/dev/null)
    if [[ -n "$kv_id" ]]; then
      az role assignment list --scope "$kv_id" -o json > "keyvault-${safe}-role-assignments.json" 2>/dev/null || echo "[]" > "keyvault-${safe}-role-assignments.json"
    fi
  done
fi

# C3PAO-oriented manifest (validator + assessor)
COLLECTED_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)
manifest_path="$OUT_DIR/manifest.json"
jq -n \
  --arg run_id "$RUN_ID" \
  --arg out_dir "$OUT_DIR" \
  --arg collected_utc "$COLLECTED_UTC" \
  --arg azure_rg "$AZURE_RG" \
  '{
    run_id: $run_id,
    out_dir: $out_dir,
    collected_utc: $collected_utc,
    compliance_framework: "CMMC L2 / NIST 800-171",
    evidence_purpose: "C3PAO assessment — Azure/Entra controls",
    control_set: ["AC.L2-3.1.13", "AC.L2-3.1.14", "IA.L2-3.5.3", "IA.L2-3.5.4", "IA.L2-3.5.5", "IA.L2-3.5.6", "MA.L2-3.7.5", "AU.L2-3.3.1", "AU.L2-3.3.2", "SC.L2-3.13.5", "SC.L2-3.13.8", "SC.L2-3.13.10"],
    azure_resource_group: $azure_rg,
    artifacts: {}
  }' > "$manifest_path" 2>/dev/null || printf '%s\n' "{\"run_id\":\"$RUN_ID\",\"out_dir\":\"$OUT_DIR\",\"collected_utc\":\"$COLLECTED_UTC\",\"compliance_framework\":\"CMMC L2 / NIST 800-171\",\"evidence_purpose\":\"C3PAO assessment\",\"control_set\":[\"AC.L2-3.1.13\",\"AC.L2-3.1.14\",\"IA.L2-3.5.3\",\"IA.L2-3.5.4\",\"IA.L2-3.5.5\",\"IA.L2-3.5.6\",\"MA.L2-3.7.5\",\"AU.L2-3.3.1\",\"AU.L2-3.3.2\",\"SC.L2-3.13.5\",\"SC.L2-3.13.8\",\"SC.L2-3.13.10\"],\"azure_resource_group\":\"$AZURE_RG\",\"artifacts\":{}}" > "$manifest_path"

# Evidence collection summary for assessors (C3PAO)
cat > "$OUT_DIR/EVIDENCE_COLLECTION.txt" << EOF
Azure/Entra Evidence Collection — C3PAO Assessment
=================================================
Run ID: $RUN_ID
Collected (UTC): $COLLECTED_UTC
Resource group: $AZURE_RG
Framework: CMMC L2 / NIST 800-171

Purpose: This run supports C3PAO assessment of the seven Azure/Entra controls
(IA.L2-3.5.3, 3.5.4–3.5.6, MA.L2-3.7.5, SC.L2-3.13.10, SC.L2-3.13.5). Use the
validation report produced by validate_azure_entra.py together with this
evidence set. MFA-in-path attestation (Governance > Evidence) applies to the
five IA/MA controls when technical config is present; signed attestation
required for PASS.

Artifacts: role-assignments-*, nsg-list, nsg-rules-*, entra-signin,
conditional-access-policies, keyvault-*, manifest.json.
EOF

echo "Done. Artifacts in $OUT_DIR"
