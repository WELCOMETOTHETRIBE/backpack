#!/usr/bin/env bash
# Write MFA-in-path attestation file so validate_azure_entra.py can pass ENTRA-MFA and ENTRA-MFA-MA.
# Run only after MFA is actually enforced in the enclave access path (VPN+Entra, Azure AD login for RDP, or Bastion).
# Usage: OUT_DIR=evidence/runs/<RunId>/raw/azure ./write_mfa_attestation.sh
#   or:  ./write_mfa_attestation.sh evidence/runs/20260214-210217/raw/azure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$SCRIPT_DIR/../..}"
OUT_DIR="${OUT_DIR:-}"

if [[ -n "${1:-}" ]]; then
  OUT_DIR="$1"
fi

if [[ -z "$OUT_DIR" ]]; then
  echo "Usage: OUT_DIR=evidence/runs/<RunId>/raw/azure $0"
  echo "   or: $0 evidence/runs/<RunId>/raw/azure"
  exit 1
fi

# Resolve relative to repo root if needed
if [[ "$OUT_DIR" != /* ]]; then
  OUT_DIR="$REPO_ROOT/$OUT_DIR"
fi

mkdir -p "$OUT_DIR"
ATTEST_FILE="$OUT_DIR/mfa-in-path-attested.txt"
DATE=$(date -u +%Y-%m-%d)

cat > "$ATTEST_FILE" << EOF
MFA is enforced in the enclave access path. Access to the VM requires VPN with Entra sign-in (MFA) or Azure AD login for RDP, or Azure Bastion. Date: $DATE.
EOF

echo "Wrote $ATTEST_FILE"
cat "$ATTEST_FILE"
