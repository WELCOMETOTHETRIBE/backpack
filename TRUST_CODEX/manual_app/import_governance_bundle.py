#!/usr/bin/env python3
"""
Import the full platform-agnostic governance bundle into this repo's TRUST_CODEX/governance/.

Why:
- The Manual App governance wizard expects docs referenced by governance-manifest.json.
- Some repo snapshots include only a subset of the platform-agnostic bundle.

This script:
1) Copies artifacts/.../governance/platform-agnostic/* into TRUST_CODEX/governance/platform-agnostic/
2) Regenerates manual_app/governance-manifest.json from the imported 02-policies-and-procedures folder
3) Regenerates governance/GOVERNANCE_BUNDLE_INDEX.md from the manifest
4) Ensures each MAC-POL/MAC-SOP doc contains a "Signature & evidence record" section (template text)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


RE_CODE = re.compile(r"^(MAC-[A-Z]{3}-\d{3}|MAC-[A-Z]{3}-\d{3,})", re.IGNORECASE)


@dataclass(frozen=True)
class Doc:
    rel_id: str
    kind: str
    code: str
    title: str


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8", newline="\n")


def copy_tree(src: Path, dst: Path) -> None:
    if not src.exists() or not src.is_dir():
        raise SystemExit(f"Source directory missing: {src}")
    dst.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(src):
        root_p = Path(root)
        rel = root_p.relative_to(src)
        (dst / rel).mkdir(parents=True, exist_ok=True)
        for f in files:
            sp = root_p / f
            dp = dst / rel / f
            shutil.copy2(sp, dp)


def kind_from_code(code: str, filename: str) -> str:
    c = code.upper()
    if c.startswith("MAC-POL-"):
        return "policy"
    if c.startswith("MAC-SOP-"):
        return "procedure"
    if c.startswith("MAC-IRP-") or c.startswith("MAC-CMP-"):
        return "plan"
    if c.startswith("MAC-FRM-"):
        return "form"
    # fallback: infer from filename
    fn = filename.lower()
    if "policy" in fn:
        return "policy"
    if "procedure" in fn or "sop" in fn:
        return "procedure"
    if "plan" in fn:
        return "plan"
    return "doc"


def extract_title(md: str, fallback: str) -> str:
    # Many docs start with "PLATFORM-AGNOSTIC TEMPLATE" boilerplate. Find first '# ' after the '---' divider if present.
    lines = md.replace("\r\n", "\n").split("\n")
    # find after the first '---' divider line
    start = 0
    for i, ln in enumerate(lines[:200]):
        if ln.strip() == "---":
            start = i + 1
            break
    for ln in lines[start: start + 400]:
        if ln.startswith("# "):
            return ln[2:].strip() or fallback
    return fallback


SIG_SECTION_TITLE = "## Signature & evidence record (enclave deployment)"


def ensure_signature_section(doc_path: Path, code: str) -> bool:
    """Append a signature section if missing. Returns True if modified."""
    md = read_text(doc_path)
    if SIG_SECTION_TITLE.lower() in md.lower():
        return False
    section = (
        "\n---\n\n"
        f"{SIG_SECTION_TITLE}\n\n"
        "This template is signed using the **Trust Codex Manual** Governance workflow.\n\n"
        "**What counts as the approval record** is the per-document sign-off artifact written under `C:\\evidence`, which includes:\n"
        "- attestor identity (name/title/org)\n"
        "- timestamp (UTC)\n"
        "- **document SHA-256 hash** (the exact version reviewed)\n"
        "- **stored record location** (where the sign-off record is retained)\n\n"
        "**Expected location (written by the manual app):**\n"
        f"- `C:\\evidence\\CUI-Doc-Signoff-<RunId>\\{code}-signoff.json`\n"
        f"- `C:\\evidence\\CUI-Doc-Signoff-<RunId>\\{code}-signoff.md`\n"
    )
    write_text(doc_path, md.rstrip() + section + "\n")
    return True


def build_manifest_docs(policies_dir: Path, repo_root: Path) -> list[Doc]:
    out: list[Doc] = []
    for p in sorted(policies_dir.glob("*.md")):
        fn = p.name
        m = RE_CODE.match(fn)
        code = (m.group(1) if m else fn.split("_")[0]).upper()
        md = read_text(p)
        title = extract_title(md, fallback=fn.replace("_", " ").replace(".md", ""))
        kind = kind_from_code(code, fn)
        rel_id = str(p.relative_to(repo_root)).replace("\\", "/")
        out.append(Doc(rel_id=rel_id, kind=kind, code=code, title=title))
    return out


def render_bundle_index(docs: Iterable[Doc]) -> str:
    docs = list(docs)
    by_kind: dict[str, list[Doc]] = {}
    for d in docs:
        by_kind.setdefault(d.kind, []).append(d)
    for k in by_kind:
        by_kind[k].sort(key=lambda x: x.code)

    def section(title: str, kinds: list[str]) -> str:
        lines: list[str] = [f"### {title}"]
        any_added = False
        for k in kinds:
            for d in by_kind.get(k, []):
                any_added = True
                # links are relative to governance/ folder
                rel = d.rel_id.split("governance/", 1)[-1]
                lines.append(f"- [{d.code} {d.title}]({rel})")
        if not any_added:
            lines.append("- _None found in bundle._")
        lines.append("")
        return "\n".join(lines)

    parts = [
        "# Governance bundle index (CMMC L2 templates)",
        "",
        "Use this index to review and sign off the **governance** side of control closeout (policies, SOPs, plans, and acknowledgements).",
        "",
        "## How to use in the manual app",
        "- Open this document from the manual app Docs drawer.",
        "- Review the policy/SOP set that applies to your environment.",
        "- Record approvals and annual review cadence.",
        "- Sign each document in the manual app (Governance tab).",
        "- Each document signature writes a per-document approval record under `C:\\evidence` (hash + signer + timestamp + location).",
        "",
        "## Included documents (embedded)",
        "",
        section("Policies (MAC-POL)", ["policy"]),
        section("Procedures (MAC-SOP)", ["procedure"]),
        section("Plans / forms", ["plan", "form"]),
        section("Other supporting docs", ["doc"]),
    ]
    return "\n".join(parts).rstrip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--bundle-root",
        default="/Users/patrick/mactech/artifacts/platform-agnostic-governance-bundle-20260205-2125/platform-agnostic-governance-bundle-20260205-2125",
        help="Path to extracted platform-agnostic-governance-bundle-* root",
    )
    ap.add_argument(
        "--repo-root",
        default="/Users/patrick/cui-pilot/TRUST_CODEX",
        help="TRUST_CODEX repo root",
    )
    args = ap.parse_args()

    repo_root = Path(args.repo_root)
    bundle_root = Path(args.bundle_root)

    src = bundle_root / "governance" / "platform-agnostic"
    dst = repo_root / "governance" / "platform-agnostic"

    print(f"Copying bundle from: {src}")
    print(f"Into:               {dst}")
    copy_tree(src, dst)

    policies_dir = dst / "compliance" / "cmmc" / "level2" / "02-policies-and-procedures"
    if not policies_dir.exists():
        raise SystemExit(f"Expected policies/procedures directory missing after copy: {policies_dir}")

    docs = build_manifest_docs(policies_dir, repo_root)
    print(f"Found {len(docs)} docs in {policies_dir}")

    # Ensure signature section exists for policies + procedures specifically
    modified = 0
    for d in docs:
        if d.kind not in ("policy", "procedure"):
            continue
        p = repo_root / d.rel_id
        if ensure_signature_section(p, d.code):
            modified += 1
    print(f"Appended signature section to {modified} docs.")

    manifest = {
        "schema": "mactech.codex.manual.governance_manifest",
        "version": 3,
        "source": {"bundle": bundle_root.name, "path": "governance/platform-agnostic/compliance/cmmc/level2/02-policies-and-procedures"},
        "docs": [{"id": d.rel_id, "kind": d.kind, "code": d.code, "title": d.title} for d in docs],
    }
    manifest_path = repo_root / "manual_app" / "governance-manifest.json"
    write_text(manifest_path, json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote manifest: {manifest_path}")

    index_path = repo_root / "governance" / "GOVERNANCE_BUNDLE_INDEX.md"
    write_text(index_path, render_bundle_index(docs))
    print(f"Wrote index: {index_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

