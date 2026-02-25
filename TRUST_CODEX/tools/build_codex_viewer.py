#!/usr/bin/env python3
"""
Rebuild _build/CODEX_VIEWER.html with a complete, valid JSON payload.
The existing file may have a truncated payload (unterminated string); this script
reads source files from TRUST_CODEX and embeds them so the viewer loads.

Usage: python TRUST_CODEX/tools/build_codex_viewer.py [--trust-codex-dir TRUST_CODEX]
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_book_md(book_path: Path) -> list[str]:
    """Extract file paths from BOOK.md (lines like '8. `tables/CONTROL_MAPPING_800-171R2.md`')."""
    order: list[str] = []
    text = book_path.read_text(encoding="utf-8")
    for m in re.finditer(r"`([a-zA-Z0-9_/.\-]+\.(?:md|yml|yaml|html|json))`", text):
        order.append(m.group(1))
    return order


def collect_files(trust_codex: Path) -> dict[str, str]:
    """Collect all embeddable files under TRUST_CODEX. Returns path -> content."""
    files: dict[str, str] = {}
    # Directories to embed (relative to TRUST_CODEX)
    for rel_dir in ("chapters", "tables", "docs", "schemas", "sctm", "vault", "vm-scripts"):
        dir_path = trust_codex / rel_dir
        if not dir_path.is_dir():
            continue
        for f in dir_path.rglob("*"):
            if not f.is_file():
                continue
            try:
                rel = f.relative_to(trust_codex).as_posix()
            except ValueError:
                continue
            # Skip binary and very large files
            if rel.endswith(".zip") or "node_modules" in rel:
                continue
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            # Skip huge files that might have caused truncation (e.g. > 500k)
            if len(content) > 1_500_000:
                continue
            # Prevent "</script>" in content from closing the payload script tag in HTML
            content = content.replace("</script>", "<\\/script>")
            files[rel] = content
    # README at root
    readme = trust_codex / "README.md"
    if readme.is_file():
        files["README.md"] = readme.read_text(encoding="utf-8", errors="replace")
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--trust-codex-dir",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to TRUST_CODEX/ directory.",
    )
    ap.add_argument(
        "--out",
        default=None,
        help="Output HTML path (default: TRUST_CODEX/_build/CODEX_VIEWER.html)",
    )
    args = ap.parse_args()

    trust_codex = Path(args.trust_codex_dir).resolve()
    viewer_path = Path(args.out) if args.out else trust_codex / "_build" / "CODEX_VIEWER.html"
    viewer_path.parent.mkdir(parents=True, exist_ok=True)

    book_path = trust_codex / "BOOK.md"
    reading_order = parse_book_md(book_path) if book_path.exists() else []

    files = collect_files(trust_codex)
    # Add any collected files not in reading_order (append in stable order)
    for key in sorted(files):
        if key not in reading_order:
            reading_order.append(key)

    meta: dict[str, Any] = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "title": "MacTech CUI Pilot Trust Codex (offline bundle)",
        "reading_order": reading_order,
        "missing": [],
    }

    payload = {"meta": meta, "files": files}

    # Load existing viewer to get HTML template (before and after payload)
    existing = viewer_path.read_text(encoding="utf-8") if viewer_path.exists() else ""
    start_marker = '<script id="payload" type="application/json">'
    end_marker = "</script>"
    i = existing.find(start_marker)
    j = i + len(start_marker) if i != -1 else 0
    k = existing.find(end_marker, j) if j else 0

    if i == -1 or k == -1:
        print("ERROR: Existing CODEX_VIEWER.html not found or missing payload script; cannot get template.")
        return 1

    template_before = existing[:j]
    template_after = existing[k:]

    new_json = json.dumps(payload, ensure_ascii=False)
    new_html = template_before + new_json + template_after

    viewer_path.write_text(new_html, encoding="utf-8")
    print(f"Wrote {viewer_path} (payload {len(new_json)} chars, {len(files)} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
