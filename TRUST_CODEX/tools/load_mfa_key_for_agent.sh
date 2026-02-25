#!/usr/bin/env bash
# Load the enclave MFA key into ssh-agent and save the agent socket so Cursor agent
# (and other non-interactive runs) can use the key without a passphrase prompt.
# Run this once in your terminal; enter the passphrase when prompted. After that,
# Cursor agent can run VM commands (runbook, drift guard, etc.) until the agent exits.
#
# Usage (from repo root or with TRUST_CODEX set):
#   bash TRUST_CODEX/tools/load_mfa_key_for_agent.sh
#
# Env:
#   TRUST_CODEX_SSH_KEY  Key to load (default: ~/.ssh/enclave_mfa_key)
#   TRUST_CODEX_SSH_AGENT_ENV  Where to write socket (default: ~/.trust-codex-ssh-agent.env)

set -euo pipefail

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
SSH_KEY="${TRUST_CODEX_SSH_KEY:-$HOME/.ssh/enclave_mfa_key}"
AGENT_ENV="${TRUST_CODEX_SSH_AGENT_ENV:-$HOME/.trust-codex-ssh-agent.env}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: Key not found: $SSH_KEY"
  exit 1
fi

# If agent already has this key, just write the env and exit
if [[ -n "${SSH_AUTH_SOCK:-}" ]] && ssh-add -l 2>/dev/null | grep -q "enclave_mfa_key\|$(basename "$SSH_KEY")"; then
  echo "Key already in agent. Writing socket to $AGENT_ENV for Cursor agent."
  echo "export SSH_AUTH_SOCK=$SSH_AUTH_SOCK" > "$AGENT_ENV"
  echo "export SSH_AGENT_PID=${SSH_AGENT_PID:-}" >> "$AGENT_ENV"
  chmod 600 "$AGENT_ENV"
  echo "Done. Cursor agent can use the VM (set TRUST_CODEX_SSH_KEY=$SSH_KEY when running scripts)."
  exit 0
fi

# Start a new agent and add the key (will prompt for passphrase)
echo "Starting ssh-agent and loading key: $SSH_KEY"
echo "You will be prompted for the key passphrase once."
eval "$(ssh-agent -s)"
ssh-add "$SSH_KEY"

echo "export SSH_AUTH_SOCK=$SSH_AUTH_SOCK" > "$AGENT_ENV"
echo "export SSH_AGENT_PID=$SSH_AGENT_PID" >> "$AGENT_ENV"
chmod 600 "$AGENT_ENV"

echo ""
echo "Key loaded. Socket saved to: $AGENT_ENV"
echo "Cursor agent can now run VM commands (runbook, drift guard, etc.) using this key."
echo "To use: set TRUST_CODEX_SSH_KEY=$SSH_KEY when asking Cursor to run scripts, or export it in this terminal."
echo "The agent stays running until you kill it (kill \$SSH_AGENT_PID) or restart."
