#!/usr/bin/env python3
"""
Generate TRUST_CODEX/vm-scripts/control-implementation-map.json from the canonical
evidence index. Used by SRM/export scripts and packagers to know per-control
evidence expectations (artifact names, locations, types) without parsing the full index.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    src = trust_codex / "tables" / "evidence-index.json"
    dst = trust_codex / "vm-scripts" / "control-implementation-map.json"

    data = json.loads(src.read_text(encoding="utf-8"))
    controls = []
    for c in data.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        nist = (c.get("nist_requirement_id") or "").strip()
        classification = (c.get("classification") or "").strip()
        items = []
        for ev in c.get("evidence_items") or []:
            items.append({
                "evidence_type": (ev.get("evidence_type") or "").strip(),
                "name": (ev.get("name") or "").strip(),
                "owner_role": (ev.get("owner_role") or "").strip(),
                "location": (ev.get("location") or "").strip(),
                "cadence": (ev.get("cadence") or "").strip(),
            })
        controls.append({
            "control_id_cmmc": cid,
            "nist_requirement_id": nist,
            "classification": classification,
            "evidence_items": items,
        })

    out = {
        "metadata": {
            "source": "tables/evidence-index.json",
            "purpose": "Per-control evidence expectations for SRM/export/packager scripts.",
        },
        "controls": controls,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
