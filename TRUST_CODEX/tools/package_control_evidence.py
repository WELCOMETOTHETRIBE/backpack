#!/usr/bin/env python3
"""
Package assessor-ready per-control evidence bundles from a synced vault run.

Inputs:
- Evidence vault root (UNC path)
- Control ID (CMMC)
- RunId (optional; default: newest run in vault)

Outputs:
- bundle.zip with:
  - README.md (control statement + retrieval instructions)
  - artifacts/ (raw artifacts required for this control)
  - validation/ (validator slice, when available)
  - integrity/ (hash manifests, run manifest)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_sctm_row(sctm_csv: Path, control_id: str) -> dict[str, str] | None:
    with sctm_csv.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            cid = (row.get("control_id") or "").strip()
            if cid == control_id:
                return {k: (v or "").strip() for k, v in row.items()}
    return None


def evidence_items_for_control(evidence_index: dict[str, Any], control_id: str) -> list[dict[str, Any]]:
    for c in evidence_index.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        if cid == control_id:
            return list(c.get("evidence_items") or [])
    return []


def find_latest_run_id(vault_root: Path) -> str:
    runs_dir = vault_root / "runs"
    if not runs_dir.exists():
        raise FileNotFoundError(f"runs directory not found under vault root: {runs_dir}")
    candidates: list[str] = []
    for p in runs_dir.iterdir():
        if not p.is_dir():
            continue
        name = p.name
        if re.fullmatch(r"\d{8}-\d{6}", name):
            candidates.append(name)
    if not candidates:
        raise FileNotFoundError(f"No RunId directories found under: {runs_dir}")
    return sorted(candidates)[-1]


def locate_run_artifacts(vault_root: Path, run_id: str) -> dict[str, Path]:
    run_root = vault_root / "runs" / run_id
    raw_root = run_root / "raw"

    def pick_dir(prefix: str) -> Path | None:
        d = raw_root / f"{prefix}-{run_id}"
        return d if d.exists() else None

    paths = {
        "run_root": run_root,
        "raw_root": raw_root,
    }
    ev = pick_dir("CUI-Evidence")
    val = pick_dir("CUI-Validation")
    az = pick_dir("CUI-Azure")
    inh = pick_dir("CUI-Azure-Inheritance")
    if ev:
        paths["windows_evidence_dir"] = ev
    if val:
        paths["windows_validation_dir"] = val
    if az:
        paths["azure_dir"] = az
    if inh:
        paths["azure_inheritance_dir"] = inh

    # Validator report (expected)
    if val:
        vr = val / "validation-report.json"
        if vr.exists():
            paths["validation_report_json"] = vr
        vt = val / "validation-report.txt"
        if vt.exists():
            paths["validation_report_txt"] = vt

    # Run manifest (optional)
    rj = run_root / "run.json"
    if rj.exists():
        paths["run_manifest_json"] = rj

    return paths


def add_file(z: zipfile.ZipFile, src: Path, arcname: str) -> None:
    z.write(src, arcname=arcname)


def write_text(z: zipfile.ZipFile, arcname: str, text: str) -> None:
    z.writestr(arcname, text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-root", default=r"\\EvidenceVault\CUI-Enclave", help="Evidence vault root (UNC path).")
    ap.add_argument("--control-id", required=True, help="Control ID (CMMC), e.g. AC.L2-3.1.11")
    ap.add_argument("--run-id", default="", help="RunId to package (yyyyMMdd-HHmmss). Default: latest run.")
    ap.add_argument(
        "--out",
        default="",
        help="Output zip path. Default: <vault>/controls/<ControlId>/<RunId>/bundle.zip",
    )
    ap.add_argument(
        "--trust-codex-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to TRUST_CODEX/ directory (for SCTM + evidence index).",
    )
    args = ap.parse_args()

    trust_codex = Path(args.trust_codex_dir).resolve()
    sctm_csv = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    evidence_json = trust_codex / "tables" / "evidence-index.json"

    control_id = args.control_id.strip()
    vault_root = Path(args.vault_root)

    if not args.run_id:
        run_id = find_latest_run_id(vault_root)
    else:
        run_id = args.run_id.strip()

    if not re.fullmatch(r"\d{8}-\d{6}", run_id):
        raise SystemExit(f"Invalid --run-id format: {run_id} (expected yyyyMMdd-HHmmss)")

    evidence_index = read_json(evidence_json)
    sctm = read_sctm_row(sctm_csv, control_id)
    if not sctm:
        raise SystemExit(f"Control not found in SCTM: {control_id}")

    ev_items = evidence_items_for_control(evidence_index, control_id)
    if not ev_items:
        raise SystemExit(f"Control not found in evidence index: {control_id}")

    run_paths = locate_run_artifacts(vault_root, run_id)

    default_out = vault_root / "controls" / control_id / run_id / "bundle.zip"
    out_path = Path(args.out) if args.out else default_out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Attempt to load validator control_results when present
    validation: dict[str, Any] | None = None
    control_result: dict[str, Any] | None = None
    checks: list[dict[str, Any]] = []
    if "validation_report_json" in run_paths:
        try:
            validation = read_json(run_paths["validation_report_json"])
            checks = list(validation.get("checks") or [])
            for cr in (validation.get("control_results") or []):
                if (cr.get("control_id") or "").strip() == control_id:
                    control_result = cr
                    break
        except Exception:
            validation = None
            control_result = None
            checks = []

    required_files: list[str] = []
    missing_files: list[str] = []
    required_check_ids: list[str] = []
    failed_check_ids: list[str] = []
    pass_status: bool | None = None
    if control_result:
        required_files = list(control_result.get("required_files") or [])
        missing_files = list(control_result.get("missing_files") or [])
        required_check_ids = list(control_result.get("required_check_ids") or [])
        failed_check_ids = list(control_result.get("failed_check_ids") or [])
        pass_status = bool(control_result.get("pass"))

    # Build README
    title = sctm.get("title", "")
    classification = sctm.get("classification", "")
    pilot_status = sctm.get("pilot_status", "")
    pilot_basis = sctm.get("pilot_status_basis", "")

    readme: list[str] = []
    readme.append(f"# Evidence bundle — {control_id}")
    readme.append("")
    readme.append(f"- Generated (UTC): `{utc_now_iso()}`")
    readme.append(f"- RunId: `{run_id}`")
    readme.append("")
    readme.append("## Control")
    readme.append("")
    readme.append(f"- **Title**: {title}")
    readme.append(f"- **Classification (SCTM)**: {classification}")
    readme.append(f"- **Pilot status (SCTM)**: {pilot_status}")
    if pilot_basis:
        readme.append(f"- **Status basis**: {pilot_basis}")
    readme.append("")
    readme.append("## Evidence expectations (from Evidence Index)")
    readme.append("")
    for item in ev_items:
        readme.append(f"- **{item.get('evidence_type','')}**: {item.get('name','')}")
        readme.append(f"  - owner_role: {item.get('owner_role','')}")
        readme.append(f"  - cadence: {item.get('cadence','')}")
        readme.append(f"  - retention: {item.get('retention','')}")
        readme.append(f"  - location: {item.get('location','')}")
        note = (item.get("notes") or "").strip()
        if note:
            readme.append(f"  - notes: {note}")
    readme.append("")

    if control_result:
        readme.append("## Validator adjudication (from validation-report.json)")
        readme.append("")
        readme.append(f"- **PASS**: `{pass_status}`")
        if missing_files:
            readme.append(f"- **Missing files**: {', '.join(missing_files)}")
        if failed_check_ids:
            readme.append(f"- **Failed check IDs**: {', '.join(failed_check_ids)}")
        readme.append("")
    else:
        readme.append("## Validator adjudication")
        readme.append("")
        readme.append("_No validator control_results entry was found for this control in the selected run._")
        readme.append("")

    # Package zip
    with zipfile.ZipFile(out_path, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        write_text(z, "README.md", "\n".join(readme) + "\n")

        # integrity: include run manifest when present
        if "run_manifest_json" in run_paths:
            add_file(z, run_paths["run_manifest_json"], "integrity/run.json")

        # validation artifacts
        if "validation_report_json" in run_paths:
            add_file(z, run_paths["validation_report_json"], "validation/validation-report.json")
        if "validation_report_txt" in run_paths:
            add_file(z, run_paths["validation_report_txt"], "validation/validation-report.txt")

        if control_result:
            write_text(z, "validation/control-result.json", json.dumps(control_result, indent=2) + "\n")
            # add relevant checks (only those referenced by required_check_ids)
            if required_check_ids and checks:
                check_map = {str(c.get("id") or ""): c for c in checks}
                subset = [check_map[i] for i in required_check_ids if i in check_map]
                write_text(z, "validation/checks.json", json.dumps(subset, indent=2) + "\n")

        # artifacts from Windows evidence bundle
        ev_dir = run_paths.get("windows_evidence_dir")
        if ev_dir and required_files:
            for name in required_files:
                p = Path(ev_dir) / name
                if p.exists() and p.is_file():
                    add_file(z, p, f"artifacts/windows/{name}")

            # hashes manifest is often critical for integrity; include if present
            h = Path(ev_dir) / "hashes.sha256.txt"
            if h.exists():
                add_file(z, h, "integrity/windows-hashes.sha256.txt")

        # governance / provider attachments (best-effort) — include whatever is stored in vault for this control
        gov_dir = vault_root / "governance" / control_id
        if gov_dir.exists():
            for p in sorted(gov_dir.rglob("*")):
                if p.is_file():
                    rel = p.relative_to(gov_dir).as_posix()
                    add_file(z, p, f"artifacts/governance/{rel}")

        prov_dir = vault_root / "provider" / "azure" / control_id
        if prov_dir.exists():
            for p in sorted(prov_dir.rglob("*")):
                if p.is_file():
                    rel = p.relative_to(prov_dir).as_posix()
                    add_file(z, p, f"artifacts/provider/azure/{rel}")

    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

