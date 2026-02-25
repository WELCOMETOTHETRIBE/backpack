#!/usr/bin/env python3
"""
Build `manual-data.json` for the Trust Codex Manual app by merging:
- tables/SCTM_FULL_STATUS_LIST.csv (pilot_status / classification / owner)
- tables/evidence-index.json (canonical evidence expectations)

This script is read-only with respect to system configuration; it only reads Codex files
and writes a JSON file adjacent to itself.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class EvidenceRow:
    control_id: str
    nist_req: str
    evidence_type: str
    artifact_name: str
    owner_role: str
    location: str
    retention: str
    cadence: str
    regeneration_method: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_sctm_csv(path: Path) -> dict[str, dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        out: dict[str, dict[str, Any]] = {}
        for row in r:
            cid = (row.get("control_id") or "").strip()
            if not cid:
                continue
            out[cid] = {
                "control_id": cid,
                "family": (row.get("family") or "").strip(),
                "nist_req_id": (row.get("nist_req_id") or "").strip(),
                "title": (row.get("title") or "").strip(),
                "classification": (row.get("classification") or "").strip(),
                "pilot_status": (row.get("pilot_status") or "").strip(),
                "pilot_status_basis": (row.get("pilot_status_basis") or "").strip(),
                "owner_role": (row.get("owner_role") or "").strip(),
                # Optional metadata fields (added by apply_responsibility_metadata.py)
                "implementation_domain": (row.get("implementation_domain") or "").strip(),
                "responsibility": (row.get("responsibility") or "").strip(),
                "inheritance_source": (row.get("inheritance_source") or "").strip(),
            }
        return out


def parse_markdown_table(md: str) -> list[list[str]]:
    """
    Parse a simple pipe-delimited markdown table. Assumes no escaped pipes in cells.
    Returns rows (including header row) as lists of cell strings.
    """
    lines = [ln.rstrip("\n") for ln in md.splitlines()]
    table_start = None
    for i, ln in enumerate(lines):
        if ln.strip().startswith("|") and "Control ID" in ln and "Evidence type" in ln:
            table_start = i
            break
    if table_start is None:
        raise ValueError("Could not find Evidence Index markdown table header.")

    # Find header separator line (|---|---|...)
    sep_idx = None
    for j in range(table_start + 1, min(table_start + 5, len(lines))):
        if re.match(r"^\s*\|\s*-{3,}.*\|\s*$", lines[j]):
            sep_idx = j
            break
    if sep_idx is None:
        raise ValueError("Could not find Evidence Index table separator row.")

    # Consume table lines until a non-table line or blank line
    rows: list[list[str]] = []
    for k in range(table_start, len(lines)):
        ln = lines[k].strip()
        if not ln:
            # stop at blank after table begins and at least one data row
            if k > sep_idx + 1:
                break
            continue
        if not ln.startswith("|"):
            if k > sep_idx:
                break
            continue

        # split row
        raw = ln
        if raw.startswith("|"):
            raw = raw[1:]
        if raw.endswith("|"):
            raw = raw[:-1]
        cells = [c.strip() for c in raw.split("|")]
        rows.append(cells)

    if len(rows) < 2:
        raise ValueError("Evidence Index table parsing yielded no rows.")
    return rows


def read_evidence_index_md(path: Path) -> dict[str, EvidenceRow]:
    md = path.read_text(encoding="utf-8", errors="replace")
    rows = parse_markdown_table(md)
    header = rows[0]
    # Expected header order:
    # Control ID (CMMC) | NIST Req | Evidence type | Artifact name | Owner role | Location | Retention | Cadence | Regeneration method
    idx = {name: i for i, name in enumerate(header)}

    def get(row: list[str], col: str) -> str:
        i = idx.get(col)
        if i is None or i >= len(row):
            return ""
        return row[i].strip()

    out: dict[str, EvidenceRow] = {}
    for row in rows[2:]:  # skip header + separator
        cid = get(row, "Control ID (CMMC)")
        if not cid:
            continue
        out[cid] = EvidenceRow(
            control_id=cid,
            nist_req=get(row, "NIST Req"),
            evidence_type=get(row, "Evidence type"),
            artifact_name=get(row, "Artifact name"),
            owner_role=get(row, "Owner role"),
            location=get(row, "Location"),
            retention=get(row, "Retention"),
            cadence=get(row, "Cadence"),
            regeneration_method=get(row, "Regeneration method"),
        )
    return out


def read_evidence_index_json(path: Path) -> dict[str, EvidenceRow]:
    """
    Read canonical structured evidence index and normalize into a single EvidenceRow per control
    (Manual App currently consumes a single evidence object per control).
    """
    obj = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, EvidenceRow] = {}
    for c in obj.get("controls") or []:
        cid = (c.get("control_id_cmmc") or "").strip()
        nist = (c.get("nist_requirement_id") or "").strip()
        items = c.get("evidence_items") or []
        if not cid or not items:
            continue
        ev = items[0] or {}
        out[cid] = EvidenceRow(
            control_id=cid,
            nist_req=nist,
            evidence_type=(ev.get("evidence_type") or "").strip(),
            artifact_name=(ev.get("name") or "").strip(),
            owner_role=(ev.get("owner_role") or "").strip(),
            location=(ev.get("location") or "").strip(),
            retention=(ev.get("retention") or "").strip(),
            cadence=(ev.get("cadence") or "").strip(),
            regeneration_method=(ev.get("regeneration_method") or "").strip(),
        )
    return out


def read_sctm_data_json(path: Path) -> dict[str, dict[str, Any]]:
    """Load sctm-data.json and return control_id -> control dict for merging NIST text, intent, implementation."""
    if not path.exists():
        return {}
    obj = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, dict[str, Any]] = {}
    for c in obj.get("controls") or []:
        cid = (c.get("control_id") or "").strip()
        if cid:
            out[cid] = c
    return out


def build_manual_data(trust_codex_dir: Path) -> dict[str, Any]:
    sctm_path = trust_codex_dir / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    evidence_json_path = trust_codex_dir / "tables" / "evidence-index.json"
    evidence_md_path = trust_codex_dir / "tables" / "EVIDENCE_INDEX.md"
    mapping_path = trust_codex_dir / "tables" / "CONTROL_MAPPING_800-171R2.md"
    sctm_data_path = trust_codex_dir / "sctm" / "sctm-data.json"

    sctm = read_sctm_csv(sctm_path)
    sctm_data = read_sctm_data_json(sctm_data_path)
    # Prefer canonical structured index; fall back to markdown parsing for safety.
    if evidence_json_path.exists():
        evidence = read_evidence_index_json(evidence_json_path)
    else:
        evidence = read_evidence_index_md(evidence_md_path)

    controls: list[dict[str, Any]] = []
    missing_evidence: list[str] = []

    for cid in sorted(sctm.keys()):
        c = sctm[cid]
        ex = sctm_data.get(cid) or {}
        ev = evidence.get(cid)
        if not ev:
            missing_evidence.append(cid)
            ev_obj = {
                "evidence_type": "",
                "artifact_name": "",
                "owner_role": "",
                "location": "",
                "retention": "",
                "cadence": "",
                "regeneration_method": "",
            }
        else:
            ev_obj = {
                "evidence_type": ev.evidence_type,
                "artifact_name": ev.artifact_name,
                "owner_role": ev.owner_role,
                "location": ev.location,
                "retention": ev.retention,
                "cadence": ev.cadence,
                "regeneration_method": ev.regeneration_method,
            }

        # Merge NIST text, intent, and demonstration from sctm-data so Auditor Manual is self-contained (no runtime fetch).
        merged = {
            **c,
            "evidence": ev_obj,
            "references": {
                "evidence_index_path": "tables/EVIDENCE_INDEX.md",
                "mapping_path": "tables/CONTROL_MAPPING_800-171R2.md",
                "narrative_paths": [
                    "chapters/10_System_Enforced_Controls_by_Family.md",
                    "chapters/11_Governance_Inherited_and_NA_Controls.md",
                ],
            },
        }
        if ex:
            # Prefer sctm-data.json for pilot_status and pilot_status_basis when present (validator is source of truth)
            if (ex.get("pilot_status") or "").strip():
                merged["pilot_status"] = (ex.get("pilot_status") or "").strip()
            if (ex.get("pilot_status_basis") or "").strip():
                merged["pilot_status_basis"] = (ex.get("pilot_status_basis") or "").strip()
            if (ex.get("nist_exact_text") or "").strip():
                merged["nist_exact_text"] = (ex.get("nist_exact_text") or "").strip()
            if (ex.get("nist_discussion_guidance") or "").strip():
                merged["nist_discussion_guidance"] = (ex.get("nist_discussion_guidance") or "").strip()
            if (ex.get("intent_plain") or "").strip():
                merged["intent_plain"] = (ex.get("intent_plain") or "").strip()
            if (ex.get("classification_justification") or "").strip():
                merged["classification_justification"] = (ex.get("classification_justification") or "").strip()
            if (ex.get("policy_sop_refs") or "").strip():
                merged["policy_sop_refs"] = (ex.get("policy_sop_refs") or "").strip()
            impl = ex.get("implementation") or {}
            if isinstance(impl, dict):
                pilot = (impl.get("pilot_enforcement_summary") or "").strip()
                evidence_gen = (impl.get("evidence_generated") or "").strip()
                if pilot or evidence_gen:
                    merged["implementation_summary"] = (pilot + " " + evidence_gen).strip()
        controls.append(merged)

    meta = {
        "generated_utc": utc_now_iso(),
        "source_files": {
            "sctm_csv": str(sctm_path.relative_to(trust_codex_dir)),
            "sctm_data_json": str(sctm_data_path.relative_to(trust_codex_dir)) if sctm_data_path.exists() else "",
            "evidence_index_json": str(evidence_json_path.relative_to(trust_codex_dir)),
            "evidence_index_md": str(evidence_md_path.relative_to(trust_codex_dir)),
            "mapping_md": str(mapping_path.relative_to(trust_codex_dir)),
        },
        "counts": {
            "controls_total": len(controls),
            "evidence_index_missing": len(missing_evidence),
        },
        "warnings": {
            "evidence_index_missing_control_ids": missing_evidence[:50],
        },
    }

    return {"metadata": meta, "controls": controls}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--trust-codex-dir",
        default=str((Path(__file__).resolve().parent.parent)),
        help="Path to TRUST_CODEX directory (default: parent of manual_app/)",
    )
    ap.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent / "manual-data.json"),
        help="Output JSON path (default: manual_app/manual-data.json)",
    )
    args = ap.parse_args()

    trust_dir = Path(args.trust_codex_dir).resolve()
    out_path = Path(args.out).resolve()
    data = build_manual_data(trust_dir)

    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")
    print(f"Controls: {data['metadata']['counts']['controls_total']}")
    print(f"Evidence missing: {data['metadata']['counts']['evidence_index_missing']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

