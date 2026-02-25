#!/usr/bin/env python3
"""
Enrich SCTM_FULL_STATUS_LIST.csv with auditor-defensible requirement columns from the evidence index.

Adds per control:
- evidence_location: Where to retrieve evidence (vault path or doc path).
- evidence_regeneration: How to regenerate evidence (from evidence index).
- auditor_requirement: One-line auditor-defensible requirement (what assessor may request; what must be shown).

Source of truth for these columns: tables/evidence-index.json (first evidence item per control).
Existing SCTM columns (status, basis, owner, etc.) are preserved.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


def load_evidence_index(path: Path) -> dict[str, dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    out = {}
    for c in data.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        if not cid:
            continue
        items = c.get("evidence_items") or []
        it = items[0] if items else {}
        out[cid] = {
            "evidence_type": (it.get("evidence_type") or "").strip(),
            "name": (it.get("name") or "").strip(),
            "owner_role": (it.get("owner_role") or "").strip(),
            "location": (it.get("location") or "").replace("\\\\", "\\").strip(),
            "regeneration_method": (it.get("regeneration_method") or "").strip(),
        }
    return out


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    sctm_csv = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    evidence_json = trust_codex / "tables" / "evidence-index.json"

    if not evidence_json.exists():
        print("ERROR: evidence-index.json not found")
        return 2
    if not sctm_csv.exists():
        print("ERROR: SCTM_FULL_STATUS_LIST.csv not found")
        return 2

    ev_map = load_evidence_index(evidence_json)

    rows: list[dict[str, str]] = []
    with sctm_csv.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rows.append({k: (v or "") for k, v in row.items()})

    # Add new columns if not present
    new_cols = ["evidence_location", "evidence_regeneration", "auditor_requirement"]
    for col in new_cols:
        if col not in fieldnames:
            fieldnames.append(col)

    for row in rows:
        cid = (row.get("control_id") or "").strip()
        ev = ev_map.get(cid) or {}
        loc = ev.get("location") or ""
        regen = ev.get("regeneration_method") or ""
        name = ev.get("name") or ""
        etype = ev.get("evidence_type") or ""
        owner = ev.get("owner_role") or ""

        row["evidence_location"] = loc
        # Truncate regeneration for CSV readability (full text in evidence index)
        row["evidence_regeneration"] = regen[:300] + ("..." if len(regen) > 300 else "")

        # Auditor-defensible one-liner: what assessor may request; what must be shown
        if etype and name and loc:
            req = f"Show: {name}. Location: {loc[:80]}{'...' if len(loc)>80 else ''}. Regenerate: {regen[:60]}{'...' if len(regen)>60 else ''}"
        elif etype == "N/A Justification":
            req = f"N/A (documented). Justification and boundary rationale. Location: {loc[:80]}{'...' if len(loc)>80 else ''}"
        else:
            req = f"Evidence type: {etype}. Owner: {owner}. Location: {loc[:60]}... Regenerate: {regen[:50]}..."
        row["auditor_requirement"] = req[:500]

    with sctm_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Updated {sctm_csv} with columns: {new_cols}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
