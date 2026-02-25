#!/usr/bin/env python3
"""
Refresh the Evidence Index snapshot inside _build/CODEX_VIEWER.html so the
offline viewer shows current tables/EVIDENCE_INDEX.md (VPN+RDP, no Bastion).

Usage: python TRUST_CODEX/tools/refresh_codex_viewer_evidence_index.py [--trust-codex-dir TRUST_CODEX]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--trust-codex-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to TRUST_CODEX/ directory.",
    )
    args = ap.parse_args()

    trust_codex = Path(args.trust_codex_dir).resolve()
    viewer_path = trust_codex / "_build" / "CODEX_VIEWER.html"
    evidence_md_path = trust_codex / "tables" / "EVIDENCE_INDEX.md"

    if not viewer_path.exists():
        print(f"ERROR: {viewer_path} not found.")
        return 1
    if not evidence_md_path.exists():
        print(f"ERROR: {evidence_md_path} not found. Run build_evidence_index_md.py first.")
        return 1

    html = viewer_path.read_text(encoding="utf-8")
    new_content = evidence_md_path.read_text(encoding="utf-8")

    # Find <script id="payload" type="application/json">...</script>
    start_marker = '<script id="payload" type="application/json">'
    end_marker = "</script>"
    i = html.find(start_marker)
    if i == -1:
        print("ERROR: Could not find payload script in CODEX_VIEWER.html")
        return 1
    j = i + len(start_marker)
    k = html.find(end_marker, j)
    if k == -1:
        print("ERROR: Could not find end of payload script")
        return 1
    json_str = html[j:k]
    try:
        payload = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in payload: {e}")
        return 1

    payload["files"]["tables/EVIDENCE_INDEX.md"] = new_content
    payload["meta"]["generated_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    new_json = json.dumps(payload, ensure_ascii=False)
    new_html = html[:j] + new_json + html[k:]

    viewer_path.write_text(new_html, encoding="utf-8")
    print(f"Updated {viewer_path} with current EVIDENCE_INDEX.md (VPN+RDP, no Bastion).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
