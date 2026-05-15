#!/usr/bin/env bash
# Bootstrap a Codex intake_requests row using the same bearer token EnclaveWatch uses
# (organizations.enclavewatch_api_token). Prints JSON including intake_transaction_id
# for vault smoke scripts / token issuance.
#
# Usage:
#   export CODEX_BASE_URL="https://codex.mactechsolutionsllc.com"
#   export ENCLAVEWATCH_API_TOKEN="<organizations.enclavewatch_api_token>"
#   ./scripts/bootstrap-intake-for-vault.sh
#
set -euo pipefail

CODEX_BASE_URL="${CODEX_BASE_URL:?Set CODEX_BASE_URL}"
ENCLAVEWATCH_API_TOKEN="${ENCLAVEWATCH_API_TOKEN:?Set ENCLAVEWATCH_API_TOKEN}"

URL="${CODEX_BASE_URL%/}/api/enclavewatch/intake-requests/create"

BODY="${BODY:-{\"title\":\"Vault bootstrap intake\",\"expectedClassification\":\"CUI\",\"clientCode\":\"CLIENT\",\"projectCode\":\"INTAKE\"}}"

curl -sS "$URL" \
  -H "Authorization: Bearer ${ENCLAVEWATCH_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo ""
