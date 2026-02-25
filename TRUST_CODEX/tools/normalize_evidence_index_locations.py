#!/usr/bin/env python3
"""
Normalize Evidence Index locations to the encrypted fileshare evidence vault layout.

Goal:
- Replace placeholder or VM-local locations with stable, assessor-retrievable vault paths
- Preserve the former location as notes (pilot provenance)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--trust-codex-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to TRUST_CODEX/ directory.",
    )
    ap.add_argument(
        "--vault-root",
        default=r"\\EvidenceVault\CUI-Enclave",
        help=r"UNC path root for the evidence vault (default: \\EvidenceVault\CUI-Enclave).",
    )
    args = ap.parse_args()

    trust_codex = Path(args.trust_codex_dir).resolve()
    src = trust_codex / "tables" / "evidence-index.json"

    vault_root = str(args.vault_root).rstrip("\\")

    obj = load_json(src)
    changed = 0

    for c in obj.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        if not cid:
            continue
        for ev in c.get("evidence_items") or []:
            et = (ev.get("evidence_type") or "").strip()
            old_loc = (ev.get("location") or "").strip()

            if et == "System":
                new_loc = f"Evidence vault: {vault_root}\\controls\\{cid}\\"
            elif et == "Governance":
                new_loc = f"Evidence vault: {vault_root}\\governance\\{cid}\\"
            elif et == "Inherited Provider":
                new_loc = f"Evidence vault: {vault_root}\\provider\\azure\\{cid}\\"
            elif et == "N/A Justification":
                # Keep repo paths as-is; they are part of the Codex narrative.
                new_loc = old_loc
            else:
                new_loc = old_loc

            if new_loc and new_loc != old_loc:
                ev["location"] = new_loc
                changed += 1

                # Preserve provenance if old location was meaningful.
                if old_loc and not old_loc.startswith("Evidence vault:"):
                    note = (ev.get("notes") or "").strip()
                    prefix = "Source (pilot provenance): "
                    prov = prefix + old_loc
                    if not note:
                        ev["notes"] = prov
                    elif prov not in note:
                        ev["notes"] = note + " | " + prov

    write_json(src, obj)
    print(f"Updated: {src} (locations changed: {changed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

