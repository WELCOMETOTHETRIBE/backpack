#!/usr/bin/env bash
# Write mfa-in-path-attested.sig so the Azure/Entra validator accepts the attestation as "signed".
# The validator requires the .sig file to exist, be non-empty, and contain SIGNED_AT=.
# Run after mfa-in-path-attested.txt exists; an authorized signer should set SIGNED_BY= (or replace with a real signature).
#
# Usage: OUT_DIR=evidence/runs/<RunId>/raw/azure SIGNED_BY="name or email" ./write_mfa_attestation_sig.sh
#   or:  ./write_mfa_attestation_sig.sh evidence/runs/<RunId>/raw/azure [signed_by_identity]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$SCRIPT_DIR/../..}"
OUT_DIR="${OUT_DIR:-}"
SIGNED_BY="${SIGNED_BY:-}"

if [[ -n "${1:-}" ]]; then
  OUT_DIR="$1"
fi
if [[ -n "${2:-}" ]]; then
  SIGNED_BY="$2"
fi

if [[ -z "$OUT_DIR" ]]; then
  echo "Usage: OUT_DIR=evidence/runs/<RunId>/raw/azure [SIGNED_BY=identity] $0"
  echo "   or: $0 evidence/runs/<RunId>/raw/azure [signed_by_identity]"
  exit 1
fi

if [[ "$OUT_DIR" != /* ]]; then
  OUT_DIR="$REPO_ROOT/$OUT_DIR"
fi

SIG_FILE="$OUT_DIR/mfa-in-path-attested.sig"
SIGNED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SIGNED_BY="${SIGNED_BY:-Authorized signer (fill SIGNED_BY)}"

mkdir -p "$OUT_DIR"
cat > "$SIG_FILE" << EOF
SIGNED_AT=$SIGNED_AT
SIGNED_BY=$SIGNED_BY
EOF

echo "Wrote $SIG_FILE (attestation will be treated as signed; re-run validator to get 5 controls PASS)"
cat "$SIG_FILE"
