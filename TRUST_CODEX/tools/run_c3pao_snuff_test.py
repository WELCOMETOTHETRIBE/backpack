#!/usr/bin/env python3
"""
C3PAO Snuff Test: examine every control and determine if it passes assessor scrutiny.

For each of the 110 controls we check:
- Validation alignment: system-enforced controls must not claim PASS when SCTM says validation FAIL.
- Control-specific evidence: artifact name and implementation_summary should be specific enough
  for an assessor to verify (not purely generic).
- Required fields: basis, evidence (type, artifact, location, regeneration), NIST text, intent/summary.
- Governance/Inherited/N-A: have policy ref or SRM/justification.

Output: reports/C3PAO_SNUFF_TEST_FINDINGS.md and JSON with per-control result (PASS/WARN/FAIL).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class ControlResult:
    control_id: str
    title: str
    classification: str
    result: str  # PASS | WARN | FAIL
    reasons: list[str] = field(default_factory=list)
    remediation: str = ""


def normalize(s: str | None) -> str:
    return (s or "").strip()


def main() -> int:
    codex_root = Path(__file__).resolve().parent.parent
    manual_path = codex_root / "manual_app" / "manual-data.json"
    sctm_data_path = codex_root / "sctm" / "sctm-data.json"

    if not manual_path.exists():
        print("ERROR: manual-data.json not found", file=__import__("sys").stderr)
        return 1

    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    controls_manual = {c["control_id"]: c for c in (manual.get("controls") or [])}

    sctm_data: dict[str, dict] = {}
    if sctm_data_path.exists():
        sctm_data = {c["control_id"]: c for c in json.loads(sctm_data_path.read_text(encoding="utf-8")).get("controls", [])}

    results: list[ControlResult] = []
    for cid in sorted(controls_manual.keys()):
        c = controls_manual[cid]
        ex = sctm_data.get(cid) or {}
        title = normalize(c.get("title"))
        classification = normalize(c.get("classification"))
        basis = normalize(c.get("pilot_status_basis"))
        ev = c.get("evidence") or {}
        art = normalize(ev.get("artifact_name"))
        loc = normalize(ev.get("location"))
        regen = normalize(ev.get("regeneration_method"))
        nist = normalize(c.get("nist_exact_text"))
        intent = normalize(c.get("intent_plain"))
        impl_summary = normalize(c.get("implementation_summary"))
        ev_type = normalize(ev.get("evidence_type"))

        result = ControlResult(control_id=cid, title=title, classification=classification, result="PASS")

        # 1) FAIL: SCTM says validation FAIL (snuff test: do not claim Met when validator failed)
        basis_sctm = normalize(ex.get("pilot_status_basis"))
        if "validation FAIL" in basis_sctm or "VM validation FAIL" in basis_sctm:
            result.result = "FAIL"
            result.reasons.append("SCTM reports VM validation FAIL for this control; must not claim Met until remediated and re-validated.")
            failed_checks = ""
            if "failed_checks=" in basis_sctm:
                m = re.search(r"failed_checks=\[([^\]]+)\]", basis_sctm)
                if m:
                    failed_checks = m.group(1)
            result.remediation = f"Remediate failed validator check(s) ({failed_checks or 'see validation-report.json'}), re-run evidence + validation, then update SCTM."
            results.append(result)
            continue

        # 2) Missing required assessor-facing content
        missing = []
        if not basis:
            missing.append("pilot_status_basis")
        if not art:
            missing.append("evidence.artifact_name")
        if not loc:
            missing.append("evidence.location")
        if not regen:
            missing.append("evidence.regeneration_method")
        if not nist:
            missing.append("nist_exact_text")
        if not title and not intent:
            missing.append("title or intent_plain")
        if not ev_type:
            missing.append("evidence.evidence_type")
        if missing:
            result.result = "FAIL"
            result.reasons.append("Missing required content: " + ", ".join(missing))
            result.remediation = "Populate missing fields in manual-data (build from SCTM + evidence-index + sctm-data)."
            results.append(result)
            continue

        # 3) WARN: System-enforced but generic artifact for a control that has a specific validator check
        generic_artifact = "VM session config + Entra sign-in logs + role assignments" in art
        is_system = classification and "system" in classification.lower() and "class a" in classification.lower()
        high_signal_controls = {"AC.L2-3.1.3", "AC.L2-3.1.9", "AC.L2-3.1.10", "AC.L2-3.1.11", "AC.L2-3.1.12", "AC.L2-3.1.21"}
        if result.result == "PASS" and is_system and cid in high_signal_controls and generic_artifact:
            result.result = "WARN"
            result.reasons.append("High-signal system control has generic artifact name; prefer control-specific artifact (e.g. rdp-policy.txt for AC.L2-3.1.3).")
            result.remediation = "Evidence index and manual already support per-control bundles; ensure artifact_name in evidence-index is specific where validator has a named check."

        # 4) WARN: Implementation summary is purely generic (same across many controls)
        if result.result == "PASS" and is_system and impl_summary:
            if impl_summary.startswith("Restrict access via VPN + RDP") and "session controls" in impl_summary and len(impl_summary) < 120:
                # Could be generic; only WARN if we have a high-signal control that deserves specific text
                if cid in high_signal_controls:
                    result.result = "WARN"
                    result.reasons.append("Implementation summary is generic; add control-specific sentence (e.g. RDP redirection disabled for AC.L2-3.1.3).")

        # 5) Governance: should have policy_sop_refs
        if "governance" in classification.lower() or ev_type.lower() == "governance":
            policy_refs = normalize(c.get("policy_sop_refs"))
            if not policy_refs and result.result == "PASS":
                result.result = "WARN"
                result.reasons.append("Governance control should reference policy/SOP (policy_sop_refs).")

        results.append(result)

    # Summary
    passed = sum(1 for r in results if r.result == "PASS")
    warn = sum(1 for r in results if r.result == "WARN")
    fail = sum(1 for r in results if r.result == "FAIL")

    report = {
        "audit": "C3PAO Snuff Test — examine every control for assessor defensibility",
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "total_controls": len(results),
        "summary": {"PASS": passed, "WARN": warn, "FAIL": fail},
        "results": [
            {
                "control_id": r.control_id,
                "title": r.title,
                "classification": r.classification,
                "result": r.result,
                "reasons": r.reasons,
                "remediation": r.remediation,
            }
            for r in results
        ],
    }

    out_dir = codex_root / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = out_dir / "C3PAO_SNUFF_TEST_FINDINGS.json"
    out_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    # Markdown report
    lines = [
        "# C3PAO Snuff Test — Per-Control Assessment",
        "",
        f"**Generated:** {report['generated_utc']}",
        "",
        "Examine every control for assessor defensibility: validation alignment, evidence specificity, required fields, governance refs.",
        "",
        "---",
        "",
        "## Summary",
        "",
        f"| Result | Count |",
        f"|--------|-------|",
        f"| **PASS** | {passed} |",
        f"| **WARN** | {warn} |",
        f"| **FAIL** | {fail} |",
        f"| **Total** | {len(results)} |",
        "",
        "---",
        "",
        "## FAIL (must fix before claiming 100%)",
        "",
    ]
    for r in results:
        if r.result != "FAIL":
            continue
        lines.append(f"### {r.control_id} — {r.title}")
        lines.append("")
        for reason in r.reasons:
            lines.append(f"- {reason}")
        if r.remediation:
            lines.append(f"- **Remediation:** {r.remediation}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## WARN (harden evidence or narrative)")
    lines.append("")
    for r in results:
        if r.result != "WARN":
            continue
        lines.append(f"- **{r.control_id}** — {r.title}: {'; '.join(r.reasons)}")
        if r.remediation:
            lines.append(f"  - Remediation: {r.remediation}")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Remediation priorities")
    lines.append("")
    lines.append("1. **FAIL controls:** Remediate validator failed checks (see `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`). Re-run evidence collection and validation; update SCTM/sctm-data so status reflects PASS only when validator agrees.")
    lines.append("2. **Manual build:** Ensure `build_manual_data.py` merges `pilot_status` and `pilot_status_basis` from `sctm-data.json` when present so the Auditor Manual shows FAIL when the validator reports FAIL.")
    lines.append("3. **WARN controls:** Add control-specific artifact names or implementation_summary for high-signal controls (e.g. AC.L2-3.1.3, AC.L2-3.1.10, AC.L2-3.1.11); add policy_sop_refs for governance controls.")
    lines.append("")
    lines.append("## References")
    lines.append("")
    lines.append("- `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` — RDP-REDIR, INACTIVITY, NTLM, AUTH-UX remediation")
    lines.append("- `docs/EVIDENCE_RUNBOOK.md` — How to regenerate evidence and validation")
    lines.append("- `tools/run_c3pao_snuff_test.py` — This script")
    lines.append("")

    out_md = out_dir / "C3PAO_SNUFF_TEST_FINDINGS.md"
    out_md.write_text("\n".join(lines), encoding="utf-8")

    print(f"Snuff test complete. PASS={passed} WARN={warn} FAIL={fail}")
    print(f"Wrote: {out_json}")
    print(f"Wrote: {out_md}")
    for r in results:
        if r.result != "PASS":
            print(f"  [{r.result}] {r.control_id}: {r.title} — {'; '.join(r.reasons)[:80]}")
    return 0 if fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
