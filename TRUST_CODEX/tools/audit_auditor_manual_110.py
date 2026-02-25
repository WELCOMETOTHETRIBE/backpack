#!/usr/bin/env python3
"""
C3PAO-style audit: interrogate all 110 controls in the Trust Codex Manual (Auditor Manual tab)
and demand evidence + demonstration for every one. Output findings for self-correction.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def normalize(s: str | None) -> str:
    return (s or "").strip()


def main() -> int:
    codex_root = Path(__file__).resolve().parent.parent
    data_path = codex_root / "manual_app" / "manual-data.json"
    if not data_path.exists():
        print("ERROR: manual-data.json not found", file=sys.stderr)
        return 1

    data = json.loads(data_path.read_text(encoding="utf-8"))
    controls = data.get("controls") or []
    if len(controls) != 110:
        print(f"WARNING: expected 110 controls, got {len(controls)}", file=sys.stderr)

    findings: list[dict] = []
    by_basis: dict[str, list[str]] = {}

    for c in controls:
        cid = c.get("control_id") or ""
        ev = c.get("evidence") or {}
        basis = normalize(c.get("pilot_status_basis"))
        art = normalize(ev.get("artifact_name"))
        loc = normalize(ev.get("location"))
        regen = normalize(ev.get("regeneration_method"))
        nist = normalize(c.get("nist_exact_text"))
        intent = normalize(c.get("intent_plain"))
        title = normalize(c.get("title"))
        ev_type = normalize(ev.get("evidence_type"))
        impl_summary = normalize(c.get("implementation_summary"))
        classification = normalize(c.get("classification"))

        # 1) Missing required fields (assessor can demand these)
        missing = []
        if not basis:
            missing.append("pilot_status_basis (no statement of how requirement is satisfied)")
        if not art:
            missing.append("evidence.artifact_name (what artifact to demand)")
        if not loc:
            missing.append("evidence.location (where evidence is stored)")
        if not regen:
            missing.append("evidence.regeneration_method (how to re-run evidence)")
        if not nist:
            missing.append("nist_exact_text (verbatim requirement)")
        if not title and not intent:
            missing.append("title or intent_plain (what requirement means)")
        if not ev_type:
            missing.append("evidence.evidence_type (System/Governance/Operational/etc.)")

        if missing:
            findings.append({
                "control_id": cid,
                "severity": "HIGH",
                "finding": "Missing required assessor-facing content",
                "missing": missing,
            })

        # 2) Generic status basis (same text across many controls may be acceptable for Class A; flag for review)
        if basis:
            by_basis.setdefault(basis[:80], []).append(cid)

        # 3) Weak demonstration (no implementation_summary for system-enforced)
        if classification and "system" in classification.lower() and "class a" in classification.lower():
            if not impl_summary and not basis:
                findings.append({
                    "control_id": cid,
                    "severity": "MEDIUM",
                    "finding": "System-enforced control has no implementation_summary or status basis",
                })

    # Duplicate / shared basis (informational)
    shared_basis = {k: v for k, v in by_basis.items() if len(v) > 5}
    if shared_basis:
        findings.append({
            "control_id": "(summary)",
            "severity": "LOW",
            "finding": "Many controls share the same status basis text (expected for bulk system-enforced; assessor may still demand per-control evidence artifact).",
            "count_shared_basis_groups": len(shared_basis),
        })

    # Output
    report = {
        "audit": "C3PAO-style interrogation of Auditor Manual (110 controls)",
        "total_controls": len(controls),
        "findings_count": len(findings),
        "findings": findings,
        "summary": {
            "controls_with_all_required_fields": sum(1 for c in controls if _has_all_required(c)),
            "controls_missing_anything": len([f for f in findings if f.get("control_id") and f["control_id"] != "(summary)" and "Missing" in (f.get("finding") or "")]),
        },
    }

    out_path = codex_root / "reports" / "C3PAO_AUDITOR_MANUAL_FINDINGS.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote: {out_path}")
    print(f"Total controls: {report['total_controls']}")
    print(f"Findings: {report['findings_count']}")
    print(f"Controls with all required fields: {report['summary']['controls_with_all_required_fields']}/110")
    for f in report["findings"]:
        print(f"  - [{f.get('severity')}] {f.get('control_id')}: {f.get('finding')}")
    return 0


def _has_all_required(c: dict) -> bool:
    ev = c.get("evidence") or {}
    return (
        bool(normalize(c.get("pilot_status_basis")))
        and bool(normalize(ev.get("artifact_name")))
        and bool(normalize(ev.get("location")))
        and bool(normalize(ev.get("regeneration_method")))
        and bool(normalize(c.get("nist_exact_text")))
        and (bool(normalize(c.get("title"))) or bool(normalize(c.get("intent_plain"))))
        and bool(normalize(ev.get("evidence_type")))
    )


if __name__ == "__main__":
    raise SystemExit(main())
