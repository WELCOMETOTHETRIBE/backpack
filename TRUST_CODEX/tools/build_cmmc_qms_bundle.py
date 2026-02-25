#!/usr/bin/env python3
"""
Build the CMMC Governing Records bundle for QMS ingest.

Copies all governing documents from governance/platform-agnostic/compliance/cmmc/level2/
and tables (EVIDENCE_INDEX, CONTROL_MAPPING) into cmmc-governing-records-bundle/docs/,
preserving structure. Optionally creates a zip for export.

Usage:
  python tools/build_cmmc_qms_bundle.py [--zip]

Output:
  TRUST_CODEX/cmmc-governing-records-bundle/docs/   (populated)
  TRUST_CODEX/cmmc-governing-records-bundle/CMMC_Governing_Records_YYYYMMDD.zip  (if --zip)
"""

from pathlib import Path
import shutil
import sys
import zipfile
from datetime import datetime


def main():
    script_dir = Path(__file__).resolve().parent
    codex_root = script_dir.parent
    bundle_dir = codex_root / "cmmc-governing-records-bundle"
    gov_src = codex_root / "governance" / "platform-agnostic" / "compliance" / "cmmc" / "level2"
    tables_src = codex_root / "tables"

    if not gov_src.is_dir():
        print(f"Governance source not found: {gov_src}", file=sys.stderr)
        sys.exit(1)

    docs_dst = bundle_dir / "docs"
    docs_dst.mkdir(parents=True, exist_ok=True)

    # Copy level2 tree (01-system-scope, 02-policies-and-procedures, 04-self-assessment, 05-evidence, 06-supporting-documents)
    for sub in ["01-system-scope", "02-policies-and-procedures", "04-self-assessment", "05-evidence", "06-supporting-documents"]:
        src_sub = gov_src / sub
        dst_sub = docs_dst / sub
        if src_sub.is_dir():
            if dst_sub.exists():
                shutil.rmtree(dst_sub)
            shutil.copytree(src_sub, dst_sub)
            print(f"  Copied {sub}/")
        else:
            print(f"  Skip (missing): {sub}/")

    # Copy tables
    tables_dst = docs_dst / "tables"
    tables_dst.mkdir(exist_ok=True)
    for name in ["EVIDENCE_INDEX.md", "CONTROL_MAPPING_800-171R2.md"]:
        src_f = tables_src / name
        if src_f.is_file():
            shutil.copy2(src_f, tables_dst / name)
            print(f"  Copied tables/{name}")
        else:
            print(f"  Skip (missing): tables/{name}")

    print(f"Bundle built at: {bundle_dir}")
    print(f"Manifest: {bundle_dir / 'qms-ingest-manifest.json'}")

    date_str = datetime.now().strftime("%Y%m%d")
    release_name = f"CMMC_Governing_Records_{date_str}"
    release_dir = bundle_dir / release_name
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True)
    shutil.copytree(docs_dst, release_dir / "docs")
    for name in ["qms-ingest-manifest.json", "README.md"]:
        src_f = bundle_dir / name
        if src_f.is_file():
            shutil.copy2(src_f, release_dir / name)
            print(f"  Proliferated to {release_name}/{name}")
    print(f"Release folder: {release_dir}")

    if "--zip" in sys.argv:
        zip_name = f"{release_name}.zip"
        zip_path = bundle_dir / zip_name
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in release_dir.rglob("*"):
                if f.is_file():
                    arcname = f.relative_to(release_dir.parent)
                    zf.write(f, arcname)
        print(f"Zip created: {zip_path}")


if __name__ == "__main__":
    main()
