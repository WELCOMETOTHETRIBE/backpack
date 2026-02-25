#!/usr/bin/env python3
"""
Package per-control evidence bundles for ALL controls in SCTM for a given RunId.

This is intended for enclave CI/self-hosted runners.
"""

from __future__ import annotations

import argparse
import csv
import subprocess
import sys
from pathlib import Path


def read_control_ids(sctm_csv: Path) -> list[str]:
    with sctm_csv.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        ids: list[str] = []
        for row in r:
            cid = (row.get("control_id") or "").strip()
            if cid:
                ids.append(cid)
        return ids


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-root", default=r"\\EvidenceVault\CUI-Enclave")
    ap.add_argument("--run-id", required=True, help="yyyyMMdd-HHmmss")
    ap.add_argument(
        "--trust-codex-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to TRUST_CODEX directory.",
    )
    args = ap.parse_args()

    trust = Path(args.trust_codex_dir).resolve()
    sctm = trust / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    packer = trust / "tools" / "package_control_evidence.py"

    cids = read_control_ids(sctm)
    if not cids:
        print("No control IDs found in SCTM.")
        return 2

    failures = 0
    for cid in cids:
        cmd = [
            sys.executable,
            str(packer),
            "--vault-root",
            args.vault_root,
            "--control-id",
            cid,
            "--run-id",
            args.run_id,
            "--trust-codex-dir",
            str(trust),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            failures += 1
            print(f"ERROR packaging {cid}: {r.stderr.strip() or r.stdout.strip()}")

    if failures:
        print(f"Packaging failures: {failures}/{len(cids)}")
        return 2
    print(f"Packaged controls: {len(cids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

