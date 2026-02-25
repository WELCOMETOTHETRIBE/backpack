#!/usr/bin/env bash
# Restart the Trust Codex Manual server on the VM so it loads the latest build
# (e.g. after push_build_to_vm.sh). Run from your Mac; uses SSH.
#
# If the VM uses the CodexManualServer scheduled task (server runs as SYSTEM),
# we stop and start that task. Otherwise we try PID file + Start-Process.
#
# Usage:
#   TRUST_CODEX_VM_HOST=20.57.129.142 ./restart_codex_manual_via_ssh.sh
#
# Env: TRUST_CODEX_VM_HOST, TRUST_CODEX_VM_USER, TRUST_CODEX_SSH_KEY (same as push_build_to_vm.sh)

set -euo pipefail

SSH_KEY="${TRUST_CODEX_SSH_KEY:-$HOME/.ssh/mactech-cmmc-windows-vm}"
VM_HOST="${TRUST_CODEX_VM_HOST:-20.57.129.142}"
VM_USER="${TRUST_CODEX_VM_USER:-admin_patrick}"

echo "Restarting Codex Manual server on $VM_USER@$VM_HOST..."

# Prefer scheduled task (CodexManualServer) so the new start-server.ps1 is loaded.
TASK_OUT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "schtasks /End /TN \"CodexManualServer\" 2>&1" || true)
if echo "$TASK_OUT" | grep -q "SUCCESS"; then
  echo "Stopped CodexManualServer task."
  sleep 3
  RUN_OUT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "schtasks /Run /TN \"CodexManualServer\" 2>&1" || true)
  if echo "$RUN_OUT" | grep -q "SUCCESS"; then
    echo "Started CodexManualServer task (new build loaded)."
  else
    echo "WARN: schtasks /Run failed: $RUN_OUT"
  fi
else
  # Fallback: stop by PID file, start new process
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"
    \$pidFile = 'C:\\evidence\\codex-manual-server.pid';
    if (Test-Path -LiteralPath \$pidFile) {
      \$n = [int](Get-Content \$pidFile -First 1);
      if (\$n -gt 0) { Stop-Process -Id \$n -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
    }
    Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\\Codex\\TRUST_CODEX\\manual_app\\start-server.ps1','-Bind','127.0.0.1','-Port','8787' -WindowStyle Hidden;
    Start-Sleep -Seconds 2;
  \"" || true
  echo "Started server via Start-Process."
fi

echo "Done. On the VM, open http://127.0.0.1:8787/manual_app/index.html and press Ctrl+F5 to hard-refresh."
