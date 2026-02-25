#!/usr/bin/env bash
# Continuous Drift Guard: establish a validation baseline from the enclave VM, then
# periodically run a "check" to detect configuration drift (e.g. a check that was
# PASS going to FAIL). Uses SSH + the same evidence/validation flow as the runbook.
#
# Prerequisite: SSH connection to the VM (see connect_vm_ssh.sh).
#
# Usage:
#   ./continuous_drift_guard.sh baseline              # create baseline (run collect+validate on VM, save as baseline)
#   ./continuous_drift_guard.sh baseline --run-dir evidence/runs/20260213-004500   # use existing run as baseline
#   ./continuous_drift_guard.sh check                 # run collect+validate on VM, compare to baseline, report drift
#
# Env: TRUST_CODEX_VM_HOST, TRUST_CODEX_VM_USER, TRUST_CODEX_SSH_KEY (see run_evidence_runbook_via_ssh.sh)

set -euo pipefail

# Use ssh-agent socket if user ran load_mfa_key_for_agent.sh (so Cursor agent can use MFA key)
[[ -f "${TRUST_CODEX_SSH_AGENT_ENV:-$HOME/.trust-codex-ssh-agent.env}" ]] && source "${TRUST_CODEX_SSH_AGENT_ENV:-$HOME/.trust-codex-ssh-agent.env}" 2>/dev/null || true

TRUST_CODEX="${TRUST_CODEX:-$(cd "$(dirname "$0")/.." && pwd)}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRIFT_GUARD_DIR="$REPO_ROOT/evidence/drift_guard"
BASELINE_DIR="$DRIFT_GUARD_DIR/baseline"

usage() {
  echo "Usage: $0 baseline [--run-dir PATH]  # set baseline from new run or existing run"
  echo "       $0 check                      # run validation on VM and compare to baseline"
  exit 1
}

cmd="${1:-}"
shift || true
if [[ "$cmd" != "baseline" && "$cmd" != "check" ]]; then
  usage
fi

# Parse --run-dir for baseline
USE_RUN_DIR=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--run-dir" && -n "${2:-}" ]]; then
    USE_RUN_DIR="$2"
    shift 2
  else
    shift
  fi
done

if [[ "$cmd" == "baseline" ]]; then
  mkdir -p "$BASELINE_DIR"
  if [[ -n "$USE_RUN_DIR" ]]; then
    RUN_DIR="$REPO_ROOT/$USE_RUN_DIR"
    if [[ ! -d "$RUN_DIR" ]]; then
      RUN_DIR="$USE_RUN_DIR"
    fi
    RAW="$RUN_DIR/raw"
    VALIDATION=$(find "$RAW" -name "validation-report.json" 2>/dev/null | head -1)
    if [[ -z "$VALIDATION" || ! -f "$VALIDATION" ]]; then
      echo "ERROR: No validation-report.json under $RUN_DIR/raw. Run evidence runbook first or omit --run-dir."
      exit 1
    fi
    cp "$VALIDATION" "$BASELINE_DIR/validation-report.json"
    echo "Baseline set from $VALIDATION"
  else
    echo "Running evidence runbook on VM to generate baseline..."
    RUN_ID="" bash "$TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh"
    RUN_DIR=$(ls -td "$REPO_ROOT/evidence/runs"/[0-9]*-[0-9]* 2>/dev/null | head -1)
    RUN_ID=$(basename "$RUN_DIR")
    VALIDATION="$REPO_ROOT/evidence/runs/$RUN_ID/raw/CUI-Validation-$RUN_ID/validation-report.json"
    if [[ ! -f "$VALIDATION" ]]; then
      echo "ERROR: Validation report not found at $VALIDATION"
      exit 1
    fi
    cp "$VALIDATION" "$BASELINE_DIR/validation-report.json"
    echo "$RUN_ID" > "$BASELINE_DIR/run_id"
    echo "Baseline set from run $RUN_ID"
  fi
  echo "Baseline saved to $BASELINE_DIR/validation-report.json"
  exit 0
fi

# check
if [[ ! -f "$BASELINE_DIR/validation-report.json" ]]; then
  echo "ERROR: No baseline found. Run: $0 baseline"
  exit 1
fi

echo "Running evidence runbook on VM for drift check..."
RUN_ID="" bash "$TRUST_CODEX/tools/run_evidence_runbook_via_ssh.sh"
RUN_DIR=$(ls -td "$REPO_ROOT/evidence/runs"/[0-9]*-[0-9]* 2>/dev/null | head -1)
RUN_ID=$(basename "$RUN_DIR")
CURRENT_VALIDATION="$REPO_ROOT/evidence/runs/$RUN_ID/raw/CUI-Validation-$RUN_ID/validation-report.json"
if [[ ! -f "$CURRENT_VALIDATION" ]]; then
  echo "ERROR: Current validation report not found at $CURRENT_VALIDATION"
  exit 1
fi

echo "Comparing to baseline..."
EXIT=0
if command -v python3 >/dev/null 2>&1; then
  python3 "$TRUST_CODEX/tools/compare_validation_drift.py" "$BASELINE_DIR/validation-report.json" "$CURRENT_VALIDATION" || EXIT=$?
else
  echo "WARN: python3 not found; cannot compare. Install Python or run:"
  echo "  python3 $TRUST_CODEX/tools/compare_validation_drift.py $BASELINE_DIR/validation-report.json $CURRENT_VALIDATION"
fi

# Save last check for audit
mkdir -p "$DRIFT_GUARD_DIR/last_check"
cp "$CURRENT_VALIDATION" "$DRIFT_GUARD_DIR/last_check/validation-report.json"
echo "$RUN_ID" > "$DRIFT_GUARD_DIR/last_check/run_id"
echo "Last check saved to $DRIFT_GUARD_DIR/last_check/ (run_id $RUN_ID)"

exit $EXIT
