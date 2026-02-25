#!/usr/bin/env python3
"""
Compare two validation-report.json files and report drift (regressions and improvements).
Used by continuous_drift_guard.sh to compare baseline vs current run.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_report(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def checks_by_id(report: dict) -> dict[str, dict]:
    out = {}
    for c in report.get("checks") or []:
        cid = c.get("id")
        if cid:
            out[cid] = c
    return out


def compare(baseline_path: Path, current_path: Path) -> tuple[list[str], list[str], list[str]]:
    """
    Returns (regressions, improvements, errors).
    - regressions: check ids that were PASS in baseline and FAIL in current
    - improvements: check ids that were FAIL in baseline and PASS in current
    - errors: human-readable issues (e.g. missing file)
    """
    if not baseline_path.is_file():
        return [], [], [f"Baseline not found: {baseline_path}"]
    if not current_path.is_file():
        return [], [], [f"Current report not found: {current_path}"]

    base = load_report(baseline_path)
    curr = load_report(current_path)
    base_checks = checks_by_id(base)
    curr_checks = checks_by_id(curr)

    regressions: list[str] = []
    improvements: list[str] = []

    all_ids = set(base_checks) | set(curr_checks)
    for cid in sorted(all_ids):
        b = base_checks.get(cid)
        c = curr_checks.get(cid)
        b_pass = b.get("pass") if b else None
        c_pass = c.get("pass") if c else None
        if b_pass is True and c_pass is False:
            regressions.append(cid)
        elif b_pass is False and c_pass is True:
            improvements.append(cid)

    return regressions, improvements, []


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare validation baseline vs current for drift.")
    ap.add_argument("baseline", type=Path, help="Path to baseline validation-report.json")
    ap.add_argument("current", type=Path, help="Path to current validation-report.json")
    ap.add_argument("--json", action="store_true", help="Emit machine-readable drift summary as JSON")
    args = ap.parse_args()

    regressions, improvements, errors = compare(args.baseline, args.current)
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 2

    if args.json:
        out = {
            "drift": len(regressions) > 0,
            "regressions": regressions,
            "improvements": improvements,
        }
        print(json.dumps(out, indent=2))
        return 1 if out["drift"] else 0

    if regressions:
        print("DRIFT (regressions):")
        for cid in regressions:
            print(f"  - {cid}")
    if improvements:
        print("Improvements (no longer failing):")
        for cid in improvements:
            print(f"  - {cid}")
    if not regressions and not improvements:
        print("No drift: current state matches baseline (no new failures or fixes).")
    elif not regressions:
        print("No regressions; some checks improved.")

    return 1 if regressions else 0


if __name__ == "__main__":
    sys.exit(main())
