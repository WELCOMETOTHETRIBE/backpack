#!/usr/bin/env python3
"""
Run the evidence runbook: create a RunId, collect what we can (Azure export if az available),
and produce VM instructions so the enclave evidence can be collected and merged.

Usage:
  python TRUST_CODEX/tools/run_evidence_runbook.py [--out-root evidence/runs]
  # Then on the enclave VM (VPN + RDP): run the commands printed at the end.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def main() -> int:
    ap = argparse.ArgumentParser(description="Run evidence runbook: create RunId, run Azure export, emit VM instructions.")
    ap.add_argument("--trust-codex-dir", default=os.environ.get("TRUST_CODEX", ""), help="TRUST_CODEX root")
    ap.add_argument("--out-root", default="evidence/runs", help="Root for evidence runs (relative to repo root)")
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[1].parent  # TRUST_CODEX/tools -> cui-pilot
    trust_codex = Path(args.trust_codex_dir).resolve() if args.trust_codex_dir else repo_root / "TRUST_CODEX"
    out_root = repo_root / args.out_root

    rid = run_id()
    run_dir = out_root / rid
    raw_dir = run_dir / "raw"
    azure_dir = raw_dir / "azure"
    run_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["RUN_ID"] = rid
    env["OUT_DIR"] = str(azure_dir)
    env["TRUST_CODEX"] = str(trust_codex)

    # Azure export (if az available)
    export_script = trust_codex / "tools" / "export_azure_evidence.sh"
    if export_script.exists():
        subprocess.run(
            ["bash", str(export_script)],
            env=env,
            cwd=repo_root,
            check=False,
        )
    else:
        azure_dir.mkdir(parents=True, exist_ok=True)
        (azure_dir / "README.txt").write_text("Run export_azure_evidence.sh with RUN_ID and OUT_DIR set.\n", encoding="utf-8")

    # run.json manifest
    run_json = {
        "run_id": rid,
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "evidence_runbook": "TRUST_CODEX/docs/EVIDENCE_RUNBOOK.md",
        "raw_paths": {
            "azure": str(azure_dir.relative_to(run_dir)) if azure_dir.exists() else None,
            "CUI-Evidence": "raw/CUI-Evidence-" + rid + " (from VM)",
        },
    }
    (run_dir / "run.json").write_text(json.dumps(run_json, indent=2), encoding="utf-8")

    # VM instructions
    vm_instructions = f"""# Run {rid} — VM evidence (run on enclave)

Run these on the **enclave VM** (VPN + RDP) where Codex scripts are installed (e.g. C:\\hardening\\codex-scripts\\).

## 1. Collect evidence + validate

PowerShell (elevated if needed):

```powershell
cd C:\\hardening\\codex-scripts
.\\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\\evidence
```

This creates:
- `C:\\evidence\\CUI-Evidence-{rid}\\` (or the RunId generated on the VM)
- `C:\\evidence\\CUI-Validation-<RunId>\\`

## 2. Copy to this run (or sync to vault)

Copy the VM output into this run:

- From VM: `C:\\evidence\\CUI-Evidence-<RunId>\\` → here: `{raw_dir}/CUI-Evidence-<RunId>/`
- Primary: evidence lives on the VM at `C:\\evidence\\CUI-Evidence-<RunId>\\`. Optional vault sync: `TRUST_CODEX/vault/Sync-EvidenceToVault.ps1` (from a machine that can reach \\EvidenceVault\\CUI-Enclave)

## 3. Entra sign-in logs (if not using az ad signin list)

Azure portal → Microsoft Entra ID → Monitoring → Sign-in logs → Export (CSV). Save to this run as `raw/azure/entra-signin-<date>.csv`.
"""
    (run_dir / "VM_INSTRUCTIONS.md").write_text(vm_instructions, encoding="utf-8")

    print(f"RunId: {rid}")
    print(f"Run dir: {run_dir}")
    print(f"run.json and VM_INSTRUCTIONS.md written.")
    print("")
    print("--- VM step (enclave) ---")
    print("On the enclave VM, run:")
    print("  C:\\hardening\\codex-scripts\\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\\evidence")
    print("Then copy CUI-Evidence-<RunId> and CUI-Validation-<RunId> into this run's raw/ or sync to vault.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
