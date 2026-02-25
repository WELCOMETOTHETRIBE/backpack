#!/usr/bin/env bash
# Run the evidence runbook by SSHiing to the enclave VM, optionally hardening,
# then running the collector + validator, and pulling the artifacts back.
# Works with Windows OpenSSH (no Unix test/mkdir); uses PowerShell for all remote ops.
#
# Usage:
#   TRUST_CODEX_VM_HOST=20.57.129.142 TRUST_CODEX_VM_USER=admin_patrick ./run_evidence_runbook_via_ssh.sh
#   # Optional: run hardening before collect+validate (recommended for pre-submission):
#   TRUST_CODEX_RUN_HARDENING=1 TRUST_CODEX_VM_HOST=20.57.129.142 ./run_evidence_runbook_via_ssh.sh
#
# Env:
#   TRUST_CODEX_VM_HOST     VM IP or hostname (default: 34.123.1.203)
#   TRUST_CODEX_VM_USER     SSH user (default: admin_patrick)
#   TRUST_CODEX_SSH_KEY     Path to SSH private key (default: ~/.ssh/mactech-cmmc-windows-vm)
#   TRUST_CODEX_RUN_HARDENING  If set to 1 or true, run Invoke-CuiHardening.ps1 before collect+validate

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
SSH_KEY="${TRUST_CODEX_SSH_KEY:-$HOME/.ssh/mactech-cmmc-windows-vm}"
VM_HOST="${TRUST_CODEX_VM_HOST:-34.123.1.203}"
VM_USER="${TRUST_CODEX_VM_USER:-admin_patrick}"
RUN_HARDENING="${TRUST_CODEX_RUN_HARDENING:-0}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
RUN_DIR="$REPO_ROOT/evidence/runs/$RUN_ID"
RAW_DIR="$RUN_DIR/raw"

# Remote paths (PowerShell accepts forward slashes)
CODEX_SCRIPTS_REMOTE="C:/hardening/codex-scripts"
EVIDENCE_OUTROOT="C:/evidence"

mkdir -p "$RAW_DIR"

echo "RunId: $RUN_ID"
echo "VM: $VM_USER@$VM_HOST"
echo "Run dir: $RUN_DIR"
echo "Run hardening first: $RUN_HARDENING"

# 1) Ensure codex-scripts exist on VM (PowerShell: no Unix test/mkdir)
echo "Checking codex-scripts on VM..."
SCRIPT_EXISTS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Write-Output (Test-Path -LiteralPath '$CODEX_SCRIPTS_REMOTE/Collect-Cui-Evidence.ps1' -PathType Leaf)\"" 2>/dev/null | tr -d '\r\n' || true)
if [[ "$SCRIPT_EXISTS" != "True" ]]; then
  echo "Creating $CODEX_SCRIPTS_REMOTE and uploading vm-scripts..."
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"New-Item -ItemType Directory -Path '$CODEX_SCRIPTS_REMOTE' -Force | Out-Null\""
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r "$TRUST_CODEX/vm-scripts/"* "$VM_USER@$VM_HOST:$CODEX_SCRIPTS_REMOTE/" || {
    echo "WARN: scp with $CODEX_SCRIPTS_REMOTE failed, trying /c/hardening/codex-scripts..."
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r "$TRUST_CODEX/vm-scripts/"* "$VM_USER@$VM_HOST:/c/hardening/codex-scripts/" || true
  }
else
  echo "codex-scripts present on VM."
fi

# 2) Optional: run hardening first (RDP redirection, inactivity, NTLM, etc.)
if [[ "$RUN_HARDENING" == "1" || "$RUN_HARDENING" == "true" || "$RUN_HARDENING" == "yes" ]]; then
  echo "Running Invoke-CuiHardening.ps1 on VM..."
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"
    Set-Location -LiteralPath '$CODEX_SCRIPTS_REMOTE';
    if (Test-Path -LiteralPath 'Invoke-CuiHardening.ps1' -PathType Leaf) {
      .\\Invoke-CuiHardening.ps1 -InactivityTimeoutSecs 900;
      Write-Output 'Hardening completed.'
    } else { Write-Warning 'Invoke-CuiHardening.ps1 not found; skipping.' }
  \"" || echo "WARN: Hardening step had non-zero exit (check VM); continuing."
fi

# 3) Run evidence + validation on VM with our RunId (so we know which folders to pull)
# Use backslash path for -File (Windows PowerShell requires it when invoked via SSH)
echo "Running collector + validator on VM (RunId=$RUN_ID)..."
REMOTE_SCRIPT_PATH="C:\\\\hardening\\\\codex-scripts\\\\Run-CuiBulkEvidenceAndValidate-RunId.ps1"
if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File $REMOTE_SCRIPT_PATH -OutRoot C:\\\\evidence -RunId $RUN_ID"; then
  echo "Collect + validate completed on VM."
else
  echo "WARN: Run-CuiBulkEvidenceAndValidate-RunId.ps1 failed or not found; trying Collect + Test directly..."
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VM_USER@$VM_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -Command \"
    Set-Location -LiteralPath '$CODEX_SCRIPTS_REMOTE';
    .\\Collect-Cui-Evidence.ps1 -OutRoot '$EVIDENCE_OUTROOT' -RunId '$RUN_ID';
    .\\Test-CuiHardening.ps1 -OutRoot '$EVIDENCE_OUTROOT' -RunId '$RUN_ID' -EvidenceDir '$EVIDENCE_OUTROOT/CUI-Evidence-$RUN_ID';
    Write-Output 'Done.'
  \"" || true
fi

VM_RUNID="$RUN_ID"

# 4) Pull evidence and validation back (we use the same RunId we passed)
EVIDENCE_REMOTE="C:/evidence/CUI-Evidence-$VM_RUNID"
VALIDATION_REMOTE="C:/evidence/CUI-Validation-$VM_RUNID"
LOCAL_EVIDENCE="$RAW_DIR/CUI-Evidence-$VM_RUNID"
LOCAL_VALIDATION="$RAW_DIR/CUI-Validation-$VM_RUNID"

echo "Pulling evidence from VM..."
if scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r "$VM_USER@$VM_HOST:$EVIDENCE_REMOTE" "$LOCAL_EVIDENCE" 2>/dev/null; then
  echo "Pulled $EVIDENCE_REMOTE -> $LOCAL_EVIDENCE"
else
  echo "WARN: Could not pull evidence (folder may not exist on VM)."
fi
if scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r "$VM_USER@$VM_HOST:$VALIDATION_REMOTE" "$LOCAL_VALIDATION" 2>/dev/null; then
  echo "Pulled $VALIDATION_REMOTE -> $LOCAL_VALIDATION"
else
  echo "WARN: Could not pull validation (folder may not exist on VM)."
fi

# 5) run.json
cat > "$RUN_DIR/run.json" << EOF
{
  "run_id": "$RUN_ID",
  "vm_run_id": "$VM_RUNID",
  "generated_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "evidence_runbook": "TRUST_CODEX/docs/EVIDENCE_RUNBOOK.md",
  "raw_paths": {
    "CUI-Evidence": "raw/CUI-Evidence-$VM_RUNID",
    "CUI-Validation": "raw/CUI-Validation-$VM_RUNID"
  }
}
EOF

echo "Done. Evidence in $RUN_DIR"
ls -la "$RAW_DIR" 2>/dev/null || true
