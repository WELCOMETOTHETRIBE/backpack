#!/usr/bin/env bash
# Push the refreshed Trust Codex build to the VM so the auditor sees the latest
# (CODEX_VIEWER.html, Auditor Manual / manual app with latest manual-data.json).
#
# Usage:
#   TRUST_CODEX_VM_HOST=20.57.129.142 TRUST_CODEX_VM_USER=admin_patrick ./push_build_to_vm.sh
#   # or set env and run:
#   ./push_build_to_vm.sh

set -euo pipefail

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
SSH_KEY="${TRUST_CODEX_SSH_KEY:-$HOME/.ssh/mactech-cmmc-windows-vm}"
VM_HOST="${TRUST_CODEX_VM_HOST:-20.57.129.142}"
VM_USER="${TRUST_CODEX_VM_USER:-admin_patrick}"
REMOTE_BASE="C:/evidence"
# VM serves the manual from C:\Codex\TRUST_CODEX\manual_app\ (run-codex-manual-server.ps1). Push there by default so the new build is visible.
REMOTE_CODEX="${TRUST_CODEX_REMOTE_CODEX:-C:/Codex/TRUST_CODEX}"

echo "VM: $VM_USER@$VM_HOST"
echo "Remote base: $REMOTE_BASE"

# 1) CODEX_VIEWER.html -> C:\evidence\CODEX_VIEWER.html
if [[ -f "$TRUST_CODEX/_build/CODEX_VIEWER.html" ]]; then
  echo "Pushing CODEX_VIEWER.html..."
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$TRUST_CODEX/_build/CODEX_VIEWER.html" \
    "$VM_USER@$VM_HOST:$REMOTE_BASE/CODEX_VIEWER.html" || true
  echo "Done: CODEX_VIEWER.html"
else
  echo "Skip: _build/CODEX_VIEWER.html not found"
fi

# 2) Auditor Manual (manual app) -> C:\evidence\manual\ (full copy so Drift Guard tab, start-server.ps1, etc. are present)
echo "Pushing Auditor Manual (manual app, full)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" \
  "mkdir -p $REMOTE_BASE/manual 2>/dev/null || mkdir -p /c/evidence/manual 2>/dev/null || true" 2>/dev/null || true
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
  "$TRUST_CODEX/manual_app/"* \
  "$VM_USER@$VM_HOST:$REMOTE_BASE/manual/" 2>/dev/null || true
echo "Done: Auditor Manual at $REMOTE_BASE/manual/ (run start-server.ps1 from that folder for full features)."

# 2b) vm-scripts -> C:\evidence\vm-scripts so start-server.ps1 (run from C:\evidence\manual\) finds Drift Guard and other scripts
echo "Pushing vm-scripts to $REMOTE_BASE/vm-scripts..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" \
  "mkdir -p $REMOTE_BASE/vm-scripts 2>/dev/null || mkdir -p /c/evidence/vm-scripts 2>/dev/null || true" 2>/dev/null || true
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
  "$TRUST_CODEX/vm-scripts/"* \
  "$VM_USER@$VM_HOST:$REMOTE_BASE/vm-scripts/" 2>/dev/null || true
echo "Done: vm-scripts at $REMOTE_BASE/vm-scripts/"

# 3) README-for-auditor.txt
if [[ -f "$TRUST_CODEX/vm-scripts/README-for-auditor.txt" ]]; then
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$TRUST_CODEX/vm-scripts/README-for-auditor.txt" \
    "$VM_USER@$VM_HOST:$REMOTE_BASE/README-for-auditor.txt" 2>/dev/null || true
  echo "Done: README-for-auditor.txt"
fi

# 4) Push to C:\Codex\TRUST_CODEX\ (default) so manual_app, vm-scripts, _build, tables, docs, governance are where the VM server runs from
if [[ -n "$REMOTE_CODEX" ]]; then
  echo "Pushing to $REMOTE_CODEX (manual_app, vm-scripts, _build, tables, docs, governance)..."
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" \
    "mkdir -p $REMOTE_CODEX/manual_app $REMOTE_CODEX/vm-scripts $REMOTE_CODEX/_build $REMOTE_CODEX/tables $REMOTE_CODEX/docs $REMOTE_CODEX/governance 2>/dev/null || true" 2>/dev/null || true
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
    "$TRUST_CODEX/manual_app/"* \
    "$VM_USER@$VM_HOST:$REMOTE_CODEX/manual_app/" 2>/dev/null || true
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
    "$TRUST_CODEX/vm-scripts/"* \
    "$VM_USER@$VM_HOST:$REMOTE_CODEX/vm-scripts/" 2>/dev/null || true
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$TRUST_CODEX/_build/CODEX_VIEWER.html" \
    "$VM_USER@$VM_HOST:$REMOTE_CODEX/_build/" 2>/dev/null || true
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
    "$TRUST_CODEX/tables/"* \
    "$VM_USER@$VM_HOST:$REMOTE_CODEX/tables/" 2>/dev/null || true
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
    "$TRUST_CODEX/docs/"* \
    "$VM_USER@$VM_HOST:$REMOTE_CODEX/docs/" 2>/dev/null || true
  if [[ -d "$TRUST_CODEX/governance" ]]; then
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r \
      "$TRUST_CODEX/governance/"* \
      "$VM_USER@$VM_HOST:$REMOTE_CODEX/governance/" 2>/dev/null || true
    echo "Done: governance/ pushed (required for Bulk sign Supporting docs)."
  fi
  echo "Done: $REMOTE_CODEX updated."
fi

echo "Build push complete."
echo "  Manual (with Drift Guard) is at $REMOTE_CODEX\\manual_app\\ — open http://127.0.0.1:8787/manual_app/index.html after starting the server from that folder."
echo "  To skip updating C:\\Codex\\TRUST_CODEX\\, run: TRUST_CODEX_REMOTE_CODEX= ./push_build_to_vm.sh"
