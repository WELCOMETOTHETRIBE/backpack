#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <resource-group> <storage-account-name>"
  exit 1
fi

RESOURCE_GROUP="$1"
STORAGE_ACCOUNT="$2"
EXPECTED_LOCATION="${3:-}"

az cloud set --name AzureUSGovernment

echo "Checking storage account baseline for $STORAGE_ACCOUNT..."
ACCOUNT_JSON="$(az storage account show --resource-group "$RESOURCE_GROUP" --name "$STORAGE_ACCOUNT" -o json)"
ALLOW_BLOB_PUBLIC="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str(data.get("allowBlobPublicAccess", "")).lower())
PY
<<< "$ACCOUNT_JSON")"
ALLOW_SHARED_KEY="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str(data.get("allowSharedKeyAccess", "")).lower())
PY
<<< "$ACCOUNT_JSON")"
MIN_TLS="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("minimumTlsVersion",""))
PY
<<< "$ACCOUNT_JSON")"
HTTPS_ONLY="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str(data.get("supportsHttpsTrafficOnly","")).lower())
PY
<<< "$ACCOUNT_JSON")"
PUBLIC_NETWORK_ACCESS="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("publicNetworkAccess",""))
PY
<<< "$ACCOUNT_JSON")"
DEFAULT_ACTION="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(((data.get("networkRuleSet") or {}).get("defaultAction")) or "")
PY
<<< "$ACCOUNT_JSON")"
LOCATION="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("location",""))
PY
<<< "$ACCOUNT_JSON")"

PASS=true

check() {
  local desc="$1"
  local condition="$2"
  if [[ "$condition" == "true" ]]; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc"
    PASS=false
  fi
}

check "Azure Government location present" "$( [[ -n "$LOCATION" ]] && echo true || echo false )"
if [[ -n "$EXPECTED_LOCATION" ]]; then
  check "Expected location enforced ($EXPECTED_LOCATION)" "$( [[ "$LOCATION" == "$EXPECTED_LOCATION" ]] && echo true || echo false )"
fi
check "Anonymous blob access disabled" "$( [[ "$ALLOW_BLOB_PUBLIC" == "false" ]] && echo true || echo false )"
check "Secure transfer required" "$( [[ "$HTTPS_ONLY" == "true" ]] && echo true || echo false )"
check "TLS minimum set to TLS1_2" "$( [[ "$MIN_TLS" == "TLS1_2" ]] && echo true || echo false )"
check "Shared Key access disabled" "$( [[ "$ALLOW_SHARED_KEY" == "false" ]] && echo true || echo false )"
check "Public network default action deny" "$( [[ "$DEFAULT_ACTION" == "Deny" ]] && echo true || echo false )"
check "Public network access setting present" "$( [[ -n "$PUBLIC_NETWORK_ACCESS" ]] && echo true || echo false )"

echo "Checking blob service retention/versioning..."
BLOB_JSON="$(az storage account blob-service-properties show --account-name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" -o json)"
VERSIONING_ENABLED="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str(data.get("isVersioningEnabled","")).lower())
PY
<<< "$BLOB_JSON")"
DELETE_RETENTION_ENABLED="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str((data.get("deleteRetentionPolicy") or {}).get("enabled","")).lower())
PY
<<< "$BLOB_JSON")"
CONTAINER_RETENTION_ENABLED="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(str((data.get("containerDeleteRetentionPolicy") or {}).get("enabled","")).lower())
PY
<<< "$BLOB_JSON")"
check "Blob versioning enabled" "$( [[ "$VERSIONING_ENABLED" == "true" ]] && echo true || echo false )"
check "Blob soft delete enabled" "$( [[ "$DELETE_RETENTION_ENABLED" == "true" ]] && echo true || echo false )"
check "Container soft delete enabled" "$( [[ "$CONTAINER_RETENTION_ENABLED" == "true" ]] && echo true || echo false )"

echo "Checking Defender for Storage pricing..."
DEFENDER_JSON="$(az security pricing show --name StorageAccounts -o json)"
DEFENDER_TIER="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("pricingTier",""))
PY
<<< "$DEFENDER_JSON")"
check "Defender for Storage enabled (Standard tier)" "$( [[ "$DEFENDER_TIER" == "Standard" ]] && echo true || echo false )"

echo "Checking diagnostic settings..."
DIAG_JSON="$(az monitor diagnostic-settings list \
  --resource "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT" \
  -o json)"
DIAG_COUNT="$(python3 - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(len(data or []))
PY
<<< "$DIAG_JSON")"
check "Diagnostic settings configured" "$( [[ "$DIAG_COUNT" -gt 0 ]] && echo true || echo false )"

echo "Checking container separation (manual review of names)..."
az storage container list --account-name "$STORAGE_ACCOUNT" --auth-mode login --query "[].name" -o table || true

echo "Checking private endpoint support..."
PE_COUNT="$(az network private-endpoint list --resource-group "$RESOURCE_GROUP" --query "[?contains(privateLinkServiceConnections[0].privateLinkServiceId, '$STORAGE_ACCOUNT')].name | length(@)" -o tsv || echo 0)"
if [[ "$PE_COUNT" -gt 0 ]]; then
  echo "PASS: Private endpoint present for storage account"
else
  echo "WARN: No private endpoint detected for storage account in this resource group"
fi

echo "Checking role assignments for managed identities..."
ROLE_COUNT="$(az role assignment list --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT" --query "[].id | length(@)" -o tsv || echo 0)"
if [[ "$ROLE_COUNT" -gt 0 ]]; then
  echo "PASS: Role assignments exist on storage account scope"
else
  echo "WARN: No role assignments found at storage account scope"
fi

if [[ "$PASS" == "true" ]]; then
  echo "Verification complete: required baseline checks passed."
  exit 0
fi

echo "Verification complete: one or more required baseline checks failed."
exit 1
