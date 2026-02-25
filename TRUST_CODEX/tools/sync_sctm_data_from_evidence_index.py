#!/usr/bin/env python3
"""
Continuity sweep: sync sctm-data.json with evidence-index.json and VPN+RDP.

- Updates metadata.pilot_defaults.admin_access to VPN + RDP.
- For each control, sets evidence.location, evidence.artifact, evidence.regeneration_method
  from evidence-index.json (removes 'to be implemented' and Bastion artifact names).
- Replaces Bastion wording in implementation.* with VPN+RDP/runbook-aligned text.
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def build_evidence_map(ev: dict) -> dict[str, dict]:
    out = {}
    for c in ev.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        if not cid:
            continue
        items = c.get("evidence_items") or []
        it = items[0] if items else {}
        loc = (it.get("location") or "").replace("\\\\", "\\").strip()
        name = (it.get("name") or "").strip()
        regen = (it.get("regeneration_method") or "").strip()
        out[cid] = {"location": loc, "name": name, "regeneration_method": regen}
    return out


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    evidence_path = trust_codex / "tables" / "evidence-index.json"
    sctm_path = trust_codex / "sctm" / "sctm-data.json"

    if not evidence_path.exists() or not sctm_path.exists():
        print("ERROR: evidence-index.json or sctm-data.json not found")
        return 2

    ev = load_json(evidence_path)
    sctm = load_json(sctm_path)
    ev_map = build_evidence_map(ev)

    # Metadata
    if "pilot_defaults" in sctm.get("metadata", {}):
        sctm["metadata"]["pilot_defaults"]["admin_access"] = "VPN + RDP to VM; no public RDP"
    sctm["metadata"]["generated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Per-control evidence and implementation
    for c in sctm.get("controls") or []:
        cid = (c.get("control_id") or "").strip()
        ev_item = ev_map.get(cid, {})

        if "evidence" in c and ev_item:
            c["evidence"]["location"] = ev_item.get("location") or c["evidence"].get("location", "")
            c["evidence"]["artifact"] = ev_item.get("name") or c["evidence"].get("artifact", "")
            c["evidence"]["regeneration_method"] = ev_item.get("regeneration_method") or c["evidence"].get("regeneration_method", "")

        impl = c.get("implementation") or {}
        # Remove Bastion wording from implementation
        for key in ("mechanism", "pilot_enforcement_summary", "evidence_generated", "evidence_location_plan", "evidence_regeneration_plan", "verification_plan"):
            val = impl.get(key) or ""
            if "Bastion" in val:
                val = val.replace("Azure Bastion access controls", "VPN + RDP access; NSG")
                val = val.replace("Bastion-only admin path", "VPN + RDP to VM (no public RDP)")
                val = val.replace("Bastion config export", "VM session config + Entra/role exports")
                val = val.replace("Confirm Bastion-only access", "Confirm VPN + RDP access; no public RDP")
                val = val.replace("Bastion-only", "VPN + RDP (no public RDP)")
                val = val.replace("Bastion", "VPN + RDP")
                impl[key] = val
        if impl:
            c["implementation"] = impl

        if ev_item and "implementation" in c:
            c["implementation"]["evidence_location_plan"] = ev_item.get("location") or c["implementation"].get("evidence_location_plan", "")
            c["implementation"]["evidence_regeneration_plan"] = ev_item.get("regeneration_method") or c["implementation"].get("evidence_regeneration_plan", "")

        # classification_justification, na_justification, governance_satisfaction
        for key in ("classification_justification", "na_justification"):
            val = c.get(key) or ""
            if isinstance(val, str) and "Bastion" in val:
                c[key] = val.replace("Bastion-mediated", "VPN+RDP").replace("Bastion", "VPN+RDP")
        for key, obj in (c.get("governance_satisfaction") or {}).items():
            if isinstance(obj, str) and "Bastion" in obj:
                c.setdefault("governance_satisfaction", {})[key] = obj.replace("Bastion-mediated", "VPN+RDP").replace("Bastion", "VPN+RDP")

    save_json(sctm_path, sctm)

    # Regenerate sctm-data.embedded.js for GUI
    embedded_js_path = trust_codex / "sctm" / "sctm-data.embedded.js"
    minified = json.dumps(sctm, ensure_ascii=False, separators=(",", ":"))
    embedded_js_path.write_text("window.__SCTM_EMBEDDED__ = " + minified + ";\n", encoding="utf-8")

    # Update inline embedded JSON in SCTM_GUI.html (single line)
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
        else:
            print("WARN: Could not find embedded script in SCTM_GUI.html")

    print(f"Updated {sctm_path} (metadata + evidence from evidence-index; Bastion → VPN+RDP)")
    print(f"Regenerated {embedded_js_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
