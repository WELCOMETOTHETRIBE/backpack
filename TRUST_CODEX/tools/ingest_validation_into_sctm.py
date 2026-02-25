#!/usr/bin/env python3
"""
Ingest validation-report.json into SCTM: update pilot_status and pilot_status_basis
for every control that appears in control_results, then update sctm-data.json,
SCTM_FULL_STATUS_LIST.csv, and embedded SCTM payloads.

Usage:
  python3 TRUST_CODEX/tools/ingest_validation_into_sctm.py --validation-report path/to/validation-report.json
  python3 TRUST_CODEX/tools/ingest_validation_into_sctm.py --validation-dir C:/evidence/CUI-Validation-20260212-120000

Only controls present in control_results are updated (VM validator output).
Governance, Inherited, and N/A controls are left unchanged.
"""

from __future__ import annotations

import csv
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest validation-report.json into SCTM (sctm-data.json + CSV)")
    ap.add_argument("--validation-report", type=str, help="Path to validation-report.json")
    ap.add_argument("--validation-dir", type=str, help="Path to CUI-Validation-<RunId> dir (uses validation-report.json inside)")
    ap.add_argument("--trust-codex-dir", type=str, default="", help="TRUST_CODEX root (default: parent of tools/)")
    args = ap.parse_args()

    trust_codex = Path(args.trust_codex_dir) if args.trust_codex_dir else Path(__file__).resolve().parents[1]
    report_path: Path | None = None
    if args.validation_report:
        report_path = Path(args.validation_report).resolve()
    elif args.validation_dir:
        report_path = Path(args.validation_dir) / "validation-report.json"
    if not report_path or not report_path.exists():
        print("ERROR: Provide --validation-report <path> or --validation-dir <path> to validation-report.json")
        return 2

    data = load_json(report_path)
    control_results = data.get("control_results") or []
    validation_dir = report_path.parent
    # Evidence dir from first result (same for whole run)
    evidence_dir = ""
    if control_results:
        evidence_dir = (control_results[0].get("evidence_dir") or "").strip().replace("/", "\\")

    # Build cid -> { pass, failed_check_ids, missing_files, basis }
    results_by_cid = {}
    for r in control_results:
        cid = (r.get("control_id") or "").strip()
        if not cid:
            continue
        passed = r.get("pass") is True
        failed = r.get("failed_check_ids") or []
        missing = r.get("missing_files") or []
        basis = (r.get("basis") or "").strip()
        results_by_cid[cid] = {
            "pass": passed,
            "failed_check_ids": failed,
            "missing_files": missing,
            "basis": basis,
        }

    if not results_by_cid:
        print("WARN: No control_results in validation report; nothing to update")
        return 0

    val_path_str = str(validation_dir).replace("/", "\\")
    evidence_dir = evidence_dir or f"C:\\evidence\\CUI-Evidence-<RunId>"

    def status_basis(cid: str, passed: bool, failed: list, missing: list) -> str:
        if passed:
            return (
                f"VM evidence + read-only validation PASS. Evidence bundle: {evidence_dir}. "
                f"Validation: {val_path_str}\\validation-report.txt/json."
            )
        failed_str = ",".join(failed) if failed else "—"
        missing_str = ",".join(missing) if missing else "—"
        return (
            f"VM validation FAIL for this control (failed_checks=[{failed_str}]; missing_files=[{missing_str}]). "
            f"Evidence bundle: {evidence_dir}. Validation: {val_path_str}\\validation-report.txt/json. "
            "Next: remediate hardening then re-run bulk evidence."
        )

    def pilot_status(passed: bool) -> str:
        return "Implemented (Evidenced on Pilot VM)" if passed else "Planned / Partially Evidenced"

    # Update sctm-data.json
    sctm_path = trust_codex / "sctm" / "sctm-data.json"
    if not sctm_path.exists():
        print(f"ERROR: {sctm_path} not found")
        return 2
    sctm = load_json(sctm_path)
    updated_sctm = 0
    for c in sctm.get("controls") or []:
        cid = (c.get("control_id") or "").strip()
        if cid not in results_by_cid:
            continue
        rec = results_by_cid[cid]
        c["pilot_status"] = pilot_status(rec["pass"])
        c["pilot_status_basis"] = status_basis(
            cid, rec["pass"], rec["failed_check_ids"], rec["missing_files"]
        )
        updated_sctm += 1
    sctm["metadata"] = sctm.get("metadata") or {}
    sctm["metadata"]["generated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sctm["metadata"]["last_validation_ingest"] = str(report_path)
    save_json(sctm_path, sctm)
    print(f"Updated sctm-data.json: {updated_sctm} controls from {report_path}")

    # Update SCTM_FULL_STATUS_LIST.csv
    csv_path = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    if not csv_path.exists():
        print(f"WARN: {csv_path} not found; skipping CSV update")
    else:
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fieldnames = reader.fieldnames or []
        if "pilot_status" in fieldnames and "pilot_status_basis" in fieldnames:
            updated_csv = 0
            for row in rows:
                cid = (row.get("control_id") or "").strip()
                if cid not in results_by_cid:
                    continue
                rec = results_by_cid[cid]
                row["pilot_status"] = pilot_status(rec["pass"])
                row["pilot_status_basis"] = status_basis(
                    cid, rec["pass"], rec["failed_check_ids"], rec["missing_files"]
                )
                updated_csv += 1
            with csv_path.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)
            print(f"Updated SCTM_FULL_STATUS_LIST.csv: {updated_csv} rows")
        else:
            print("WARN: CSV missing pilot_status or pilot_status_basis column")

    # Regenerate sctm-data.embedded.js
    embedded_js = trust_codex / "sctm" / "sctm-data.embedded.js"
    minified = json.dumps(sctm, ensure_ascii=False, separators=(",", ":"))
    embedded_js.write_text("window.__SCTM_EMBEDDED__ = " + minified + ";\n", encoding="utf-8")
    print(f"Regenerated {embedded_js}")

    # Update SCTM_GUI.html inline JSON if present
    gui_html = trust_codex / "sctm" / "SCTM_GUI.html"
    if gui_html.exists():
        text = gui_html.read_text(encoding="utf-8")
        start = '<script id="embedded" type="application/json">'
        end = "</script>"
        if start in text and end in text:
            i = text.index(start)
            j = text.index(end, i)
            new_line = start + minified + end
            text = text[:i] + new_line + text[j:]
            gui_html.write_text(text, encoding="utf-8")
            print("Updated SCTM_GUI.html inline embedded JSON")

    print("Done. Rebuild manual-data and run snuff test: build_manual_data.py && run_c3pao_snuff_test.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
