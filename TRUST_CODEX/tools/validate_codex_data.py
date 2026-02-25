#!/usr/bin/env python3
"""
Validate Trust Codex data consistency (drift prevention).

This is designed to run:
- locally (best-effort, no dependencies required)
- in CI (with `jsonschema` + `pyyaml` installed for schema validation)
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass(frozen=True)
class Finding:
    level: str  # "ERROR" | "WARN"
    message: str


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_sctm_ids(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        ids: list[str] = []
        for row in r:
            cid = (row.get("control_id") or "").strip()
            if cid:
                ids.append(cid)
        return ids


def iter_evidence_items(evidence_index: dict[str, Any]) -> Iterable[tuple[str, dict[str, Any]]]:
    for c in evidence_index.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        for ev in c.get("evidence_items") or []:
            yield cid, (ev or {})


def try_schema_validate(schema_path: Path, instance: Any) -> list[str]:
    try:
        import yaml  # type: ignore
        import jsonschema  # type: ignore
    except Exception:
        return []

    try:
        schema = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
        jsonschema.validate(instance=instance, schema=schema)
        return []
    except Exception as e:
        return [str(e)]


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    sctm_csv = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    evidence_json = trust_codex / "tables" / "evidence-index.json"
    schema_yml = trust_codex / "schemas" / "evidence-index.schema.yml"
    manual_json = trust_codex / "manual_app" / "manual-data.json"

    findings: list[Finding] = []

    # Presence checks
    for p in (sctm_csv, evidence_json, schema_yml, manual_json):
        if not p.exists():
            findings.append(Finding("ERROR", f"Missing required file: {p}"))

    if any(f.level == "ERROR" for f in findings):
        for f in findings:
            print(f"{f.level}: {f.message}")
        return 2

    # SCTM ↔ Evidence Index ID parity
    sctm_ids = read_sctm_ids(sctm_csv)
    if len(sctm_ids) != 110:
        findings.append(Finding("ERROR", f"SCTM must contain 110 controls; found {len(sctm_ids)}"))

    ev = read_json(evidence_json)
    schema_errs = try_schema_validate(schema_yml, ev)
    if schema_errs:
        findings.append(Finding("ERROR", "Evidence Index JSON schema validation failed"))
        for e in schema_errs:
            findings.append(Finding("ERROR", f"  {e}"))

    ev_ids = [str(c.get("control_id_cmmc") or "").strip() for c in (ev.get("controls") or []) if (c.get("control_id_cmmc") or "").strip()]
    if len(ev_ids) != 110:
        findings.append(Finding("ERROR", f"Evidence Index JSON must contain 110 controls; found {len(ev_ids)}"))

    sctm_set = set(sctm_ids)
    ev_set = set(ev_ids)
    missing_in_ev = sorted(sctm_set - ev_set)
    extra_in_ev = sorted(ev_set - sctm_set)
    if missing_in_ev:
        findings.append(Finding("ERROR", f"Evidence Index is missing {len(missing_in_ev)} control IDs from SCTM: {missing_in_ev[:10]}{' ...' if len(missing_in_ev)>10 else ''}"))
    if extra_in_ev:
        findings.append(Finding("ERROR", f"Evidence Index has {len(extra_in_ev)} extra control IDs not in SCTM: {extra_in_ev[:10]}{' ...' if len(extra_in_ev)>10 else ''}"))

    # Evidence items completeness + placeholder blocking
    placeholder_hits = 0
    missing_items = 0
    for cid, item in iter_evidence_items(ev):
        if not cid:
            continue
        if not item:
            missing_items += 1
            continue
        loc = str(item.get("location") or "")
        if "to be implemented" in loc.lower() or "Evidence vault: /evidence/" in loc:
            placeholder_hits += 1
            findings.append(Finding("ERROR", f"Placeholder evidence location still present for {cid}: {loc}"))

    if missing_items:
        findings.append(Finding("ERROR", f"Evidence Index has {missing_items} empty evidence_items entries"))

    # Manual app dataset parity
    manual = read_json(manual_json)
    man_ids = [str(c.get("control_id") or "").strip() for c in (manual.get("controls") or []) if (c.get("control_id") or "").strip()]
    if len(man_ids) != 110:
        findings.append(Finding("ERROR", f"manual-data.json must contain 110 controls; found {len(man_ids)}"))
    if set(man_ids) != sctm_set:
        findings.append(Finding("ERROR", "manual-data.json control set does not match SCTM control set"))

    # Report
    errs = [f for f in findings if f.level == "ERROR"]
    warns = [f for f in findings if f.level == "WARN"]

    for f in errs + warns:
        print(f"{f.level}: {f.message}")

    if errs:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

