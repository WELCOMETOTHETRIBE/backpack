#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <subscription-id> <resource-group> <bicepparam-file>"
  exit 1
fi

SUBSCRIPTION_ID="$1"
RESOURCE_GROUP="$2"
PARAM_FILE="$3"

az cloud set --name AzureUSGovernment
az account set --subscription "$SUBSCRIPTION_ID"

echo "Deploying intake baseline to resource group: $RESOURCE_GROUP"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "./main.bicep" \
  --parameters "$PARAM_FILE"

echo "Deployment complete."
