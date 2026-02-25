#!/usr/bin/env python3
"""
Extrapolate run-based evidence into a control-based layout so each control has
its own manifest and (optionally) folder of artifacts. Enables:
- UI: present or link to artifacts by control only.
- CLI: open C:\\evidence\\controls\\AC.L2-3.1.3\\ to see only that control's files.
- Folder navigation: one folder per control with that control's evidence files.

Inputs:
- A run: evidence dir (e.g. CUI-Evidence-<RunId>) and validation-report.json
  (from CUI-Validation-<RunId>). You can pass a repo run dir (evidence/runs/<RunId>)
  or explicit paths.

Outputs (under --out-root, default C:\\evidence or repo evidence root):
- controls/<control_id>/manifest.json — control_id, run_id, evidence_dir, artifact_files[]
- controls/<control_id>/<file> — optional copies of each artifact (--copy-artifacts)
- control_evidence_index.json — index of all controls and their artifact paths

Usage (repo):
  python3 TRUST_CODEX/tools/build_control_evidence.py --run-dir evidence/runs/20260213-004723
  python3 TRUST_CODEX/tools/build_control_evidence.py --run-dir evidence/runs/20260213-004723 --copy-artifacts

Usage (VM, after collect+validate):
  python3 build_control_evidence.py --evidence-dir C:\\\\evidence\\\\CUI-Evidence-20260213-004723 --validation-report C:\\\\evidence\\\\CUI-Validation-20260213-004723\\\\validation-report.json --out-root C:\\\\evidence
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def infer_run_id(evidence_dir: Path) -> str:
    """e.g. CUI-Evidence-20260213-004723 -> 20260213-004723"""
    name = evidence_dir.name
    m = re.match(r"CUI-Evidence-(\d{8}-\d{6})", name, re.I)
    return m.group(1) if m else name


def find_evidence_and_validation(run_dir: Path) -> tuple[Path | None, Path | None]:
    raw = run_dir / "raw"
    if not raw.is_dir():
        return None, None
    evidence_dir = None
    validation_report = None
    for d in raw.iterdir():
        if not d.is_dir():
            continue
        if d.name.startswith("CUI-Evidence-"):
            evidence_dir = d
        elif d.name.startswith("CUI-Validation-"):
            vr = d / "validation-report.json"
            if vr.is_file():
                validation_report = vr
    return evidence_dir, validation_report


def build_control_evidence(
    evidence_dir: Path,
    validation_report_path: Path,
    out_root: Path,
    copy_artifacts: bool,
) -> dict[str, Any]:
    """
    Read validation report, build per-control artifact list, write manifests and optional copies.
    Returns the control_evidence_index dict (controls key = control_id -> manifest_path, artifact_paths).
    """
    report = load_json(validation_report_path)
    control_results = report.get("control_results") or []
    evidence_dir_str = str(evidence_dir).replace("/", "\\")
    run_id = infer_run_id(evidence_dir)

    index: dict[str, Any] = {
        "generated_utc": utc_now_iso(),
        "run_id": run_id,
        "evidence_dir": evidence_dir_str,
        "validation_report": str(validation_report_path).replace("/", "\\"),
        "controls": {},
    }

    controls_root = out_root / "controls"
    controls_root.mkdir(parents=True, exist_ok=True)

    for cr in control_results:
        control_id = (cr.get("control_id") or "").strip()
        if not control_id:
            continue
        required_files = list(cr.get("required_files") or [])
        # Resolve paths: only include files that exist in the evidence dir
        artifact_files: list[dict[str, str]] = []
        for name in required_files:
            if not name or not name.strip():
                continue
            name = name.strip()
            src = evidence_dir / name
            if not src.is_file():
                continue
            path_str = str(src.resolve()).replace("/", "\\")
            artifact_files.append({"name": name, "path": path_str})

        manifest = {
            "control_id": control_id,
            "run_id": run_id,
            "evidence_dir": evidence_dir_str,
            "artifact_files": artifact_files,
            "generated_utc": utc_now_iso(),
        }

        control_dir = controls_root / control_id
        control_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = control_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        artifact_paths = [a["path"] for a in artifact_files]
        index["controls"][control_id] = {
            "manifest_path": str(manifest_path.resolve()).replace("/", "\\"),
            "artifact_paths": artifact_paths,
        }

        if copy_artifacts:
            for a in artifact_files:
                name = a["name"]
                src = evidence_dir / name
                dst = control_dir / name
                if src.is_file() and src != dst:
                    shutil.copy2(src, dst)

    index_path = out_root / "control_evidence_index.json"
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")

    return index


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Extrapolate run-based evidence into control-based manifests and optional artifact copies."
    )
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--run-dir",
        type=Path,
        metavar="DIR",
        help="Repo run directory, e.g. evidence/runs/20260213-004723 (finds raw/CUI-Evidence-*, raw/CUI-Validation-*).",
    )
    group.add_argument(
        "--evidence-dir",
        type=Path,
        metavar="DIR",
        help="Evidence bundle directory (e.g. C:\\evidence\\CUI-Evidence-20260213-004723). Use with --validation-report.",
    )
    ap.add_argument(
        "--validation-report",
        type=Path,
        metavar="FILE",
        help="Path to validation-report.json (required when using --evidence-dir).",
    )
    ap.add_argument(
        "--out-root",
        type=Path,
        default=None,
        metavar="DIR",
        help="Output root for controls/ and control_evidence_index.json. Default: parent of evidence dir, or repo evidence/.",
    )
    ap.add_argument(
        "--copy-artifacts",
        action="store_true",
        help="Copy each control's artifact files into controls/<control_id>/ for folder navigation.",
    )
    args = ap.parse_args()

    evidence_dir: Path | None = None
    validation_report_path: Path | None = None
    out_root: Path

    if args.run_dir:
        args.run_dir = args.run_dir.resolve()
        evidence_dir, validation_report_path = find_evidence_and_validation(args.run_dir)
        if not evidence_dir or not validation_report_path:
            print("ERROR: Could not find CUI-Evidence-* and validation-report.json under", args.run_dir)
            return 1
        out_root = args.out_root or (args.run_dir.parent if "evidence" in str(args.run_dir) else args.run_dir)
    else:
        evidence_dir = args.evidence_dir.resolve() if args.evidence_dir else None
        validation_report_path = args.validation_report.resolve() if args.validation_report else None
        if not evidence_dir or not validation_report_path:
            print("ERROR: --evidence-dir and --validation-report are required when not using --run-dir.")
            return 1
        if not evidence_dir.is_dir():
            print("ERROR: Evidence dir not found:", evidence_dir)
            return 1
        if not validation_report_path.is_file():
            print("ERROR: Validation report not found:", validation_report_path)
            return 1
        out_root = args.out_root or evidence_dir.parent

    out_root = out_root.resolve()
    index = build_control_evidence(
        evidence_dir,
        validation_report_path,
        out_root,
        copy_artifacts=args.copy_artifacts,
    )
    n = len(index.get("controls") or {})
    print(f"Wrote control manifests and index: {out_root / 'controls'} ({n} controls)")
    print(f"Index: {out_root / 'control_evidence_index.json'}")
    if args.copy_artifacts:
        print("Artifact copies written under each control folder.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
