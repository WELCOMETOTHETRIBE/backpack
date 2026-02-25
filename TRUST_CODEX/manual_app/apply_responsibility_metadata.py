#!/usr/bin/env python3
"""
Apply responsibility / inheritance metadata across:
- tables/SCTM_FULL_STATUS_LIST.csv (adds columns)
- sctm/sctm-data.json (adds fields per control)

Source of truth for Class A domains is:
- vm-scripts/control-implementation-map.json

After updating CSV, re-run build_manual_data.py to regenerate manual_app/manual-data.json.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ImplMeta:
    implementation_domain: str
    responsibility: str
    inheritance_source: str


def load_impl_map(trust_codex_dir: Path) -> dict[str, ImplMeta]:
    p = trust_codex_dir / "vm-scripts" / "control-implementation-map.json"
    obj = json.loads(p.read_text(encoding="utf-8"))
    out: dict[str, ImplMeta] = {}
    for c in obj.get("controls") or []:
        cid = str(c.get("control_id") or "").strip()
        if not cid:
            continue
        out[cid] = ImplMeta(
            implementation_domain=str(c.get("implementation_domain") or "").strip(),
            responsibility=str(c.get("responsibility") or "").strip(),
            inheritance_source=str(c.get("inheritance_source") or "").strip(),
        )
    return out


def meta_for_row(row: dict[str, str], impl: dict[str, ImplMeta]) -> ImplMeta:
    cid = (row.get("control_id") or "").strip()
    classification = (row.get("classification") or "").strip().lower()

    # Prefer explicit map when present.
    if cid in impl:
        return impl[cid]

    # Non-ClassA: derive from classification.
    if classification == "inherited":
        return ImplMeta(
            implementation_domain="azure_platform_inherited",
            responsibility="provider",
            inheritance_source="Microsoft Azure (physical datacenter/platform)",
        )
    if "not applicable" in classification or classification in {"n/a", "na"}:
        return ImplMeta(implementation_domain="process_only", responsibility="customer", inheritance_source="")
    if "governance" in classification:
        return ImplMeta(implementation_domain="process_only", responsibility="customer", inheritance_source="")
    # Default unknown
    return ImplMeta(implementation_domain="", responsibility="", inheritance_source="")


def update_sctm_csv(trust_codex_dir: Path, impl: dict[str, ImplMeta]) -> None:
    p = trust_codex_dir / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    rows: list[dict[str, str]] = []
    with p.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        fieldnames = list(r.fieldnames or [])
        for row in r:
            rows.append({k: (v or "") for k, v in row.items()})

    # Add new columns (append to preserve existing order)
    new_cols = ["implementation_domain", "responsibility", "inheritance_source"]
    for c in new_cols:
        if c not in fieldnames:
            fieldnames.append(c)

    for row in rows:
        m = meta_for_row(row, impl)
        row["implementation_domain"] = m.implementation_domain
        row["responsibility"] = m.responsibility
        row["inheritance_source"] = m.inheritance_source

    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for row in rows:
            w.writerow(row)


def update_sctm_data_json(trust_codex_dir: Path, impl: dict[str, ImplMeta]) -> None:
    p = trust_codex_dir / "sctm" / "sctm-data.json"
    obj = json.loads(p.read_text(encoding="utf-8"))
    ctrls = obj.get("controls") or []
    if not isinstance(ctrls, list):
        return

    for c in ctrls:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("control_id") or "").strip()
        if not cid:
            continue
        classification = str(c.get("classification") or "").strip().lower()
        if cid in impl:
            m = impl[cid]
        elif classification == "inherited":
            m = ImplMeta(
                implementation_domain="azure_platform_inherited",
                responsibility="provider",
                inheritance_source="Microsoft Azure (physical datacenter/platform)",
            )
        elif "not applicable" in classification or classification in {"n/a", "na"}:
            m = ImplMeta(implementation_domain="process_only", responsibility="customer", inheritance_source="")
        elif "governance" in classification:
            m = ImplMeta(implementation_domain="process_only", responsibility="customer", inheritance_source="")
        else:
            m = ImplMeta(implementation_domain="", responsibility="", inheritance_source="")

        # Inject fields (non-breaking for consumers)
        c["implementation_domain"] = m.implementation_domain
        c["responsibility"] = m.responsibility
        c["inheritance_source"] = m.inheritance_source

    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    trust_codex_dir = Path(__file__).resolve().parent.parent
    impl = load_impl_map(trust_codex_dir)
    update_sctm_csv(trust_codex_dir, impl)
    update_sctm_data_json(trust_codex_dir, impl)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

