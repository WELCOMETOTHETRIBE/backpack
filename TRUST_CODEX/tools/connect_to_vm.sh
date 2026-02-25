#!/usr/bin/env bash
# Connect to the Trust Codex enclave VM using the passphrase-protected MFA key.
# Prompts you for the key passphrase, then starts an interactive SSH session.
#
# Usage (from repo root or with TRUST_CODEX set):
#   bash TRUST_CODEX/tools/connect_to_vm.sh
# Or: Cursor, please run connect_to_vm script and I'll enter the passphrase when prompted.
#
# Env (optional):
#   TRUST_CODEX_VM_HOST     VM IP or hostname (default: 20.57.129.142)
#   TRUST_CODEX_VM_USER     SSH user (default: admin_patrick)
#   TRUST_CODEX_SSH_KEY     Path to private key (default: ~/.ssh/enclave_mfa_key)

set -euo pipefail

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
# Default to MFA key so passphrase prompt is used; override with TRUST_CODEX_SSH_KEY if needed
SSH_KEY="${TRUST_CODEX_SSH_KEY:-$HOME/.ssh/enclave_mfa_key}"
VM_HOST="${TRUST_CODEX_VM_HOST:-20.57.129.142}"
VM_USER="${TRUST_CODEX_VM_USER:-admin_patrick}"
ASKPASS_HELPER="$TRUST_CODEX/tools/ssh-askpass-helper.sh"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY"
  echo "Set TRUST_CODEX_SSH_KEY to your MFA private key path."
  exit 1
fi

if [[ ! -x "$ASKPASS_HELPER" ]]; then
  chmod +x "$ASKPASS_HELPER" 2>/dev/null || true
fi

echo "Connect to VM with MFA key (passphrase-protected)"
echo "  Host: $VM_USER@$VM_HOST"
echo "  Key:  $SSH_KEY"
echo ""

# If we have a TTY, prompt for passphrase and feed to ssh via SSH_ASKPASS
if [[ -t 0 ]]; then
  read -s -p "Enter passphrase for $SSH_KEY: " PASSPHRASE
  echo ""

  if [[ -z "$PASSPHRASE" ]]; then
    echo "No passphrase entered. Exiting."
    exit 1
  fi

  TMPFILE=$(mktemp)
  trap 'rm -f "$TMPFILE"' EXIT
  printf '%s' "$PASSPHRASE" > "$TMPFILE"
  chmod 600 "$TMPFILE"
  unset PASSPHRASE

  export SSH_ASKPASS_PASSPHRASE_FILE="$TMPFILE"
  export SSH_ASKPASS="$ASKPASS_HELPER"
  export DISPLAY="${DISPLAY:-:0}"
fi
# If no TTY, we can't prompt here; ssh may prompt for passphrase if run in a terminal
if [[ ! -t 0 ]]; then
  echo "No terminal for passphrase input. Run this script in Cursor's terminal (or a real terminal) so you can enter the passphrase when ssh prompts."
fi

echo "Connecting..."
exec ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$VM_USER@$VM_HOST"
