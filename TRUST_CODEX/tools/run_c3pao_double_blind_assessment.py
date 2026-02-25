#!/usr/bin/env python3
"""
Double-blind C3PAO assessment: independent methodology and inquisitions.

This script does NOT use run_c3pao_full_assessment.py or validate_codex_data.py.
It reads only: evidence-index.json, SCTM_FULL_STATUS_LIST.csv.
It applies a separate assessor methodology to prove evidence readiness for all 110 controls.

Output: TRUST_CODEX/reports/C3PAO_DOUBLE_BLIND_ASSESSMENT.md
"""

from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# --- Methodology (assessor's own criteria) ---------------------------------

METHODOLOGY = """
Assessor methodology (double-blind):

1. **Coverage (Inquisition 1)**  
   Every control MUST have at least one evidence item. No control may be "evidence-less."

2. **Placeholder prohibition (Inquisition 2)**  
   No evidence location may be a placeholder ("to be implemented", "/evidence/" only path).  
   Location MUST resolve to a stated vault or document path.

3. **Actionable regeneration (Inquisition 3)**  
   Every evidence item MUST have a non-empty regeneration_method that references an  
   actionable source: script name (Collect-Cui-Evidence, Test-CuiHardening), runbook (EVIDENCE_RUNBOOK),  
   version-controlled docs, or provider/approval record. Vague "export and store" without reference fails.

4. **Status–evidence alignment (Inquisition 4)**  
   - If SCTM pilot_status is "Implemented (Evidenced on Pilot VM)": evidence index MUST list  
     System (or equivalent technical) evidence with vault path and regeneration.  
   - If "N/A (Documented)": index MUST have evidence_type "N/A Justification" and stated location.  
   - If "Governed (Docs Present; Records Pending)" or similar: index MUST have Governance evidence.  
   - If "Inherited" or "Inherited (Evidence Pending)": evidence_type may be Inherited Provider or  
     governance; location must be non-placeholder.

5. **Traceability (Inquisition 5)**  
   For each control we must be able to state: Control ID → evidence type → owner_role →  
   location → regeneration_method. All five fields present and non-empty per evidence item.

6. **Retrievability (Inquisition 6)**  
   For System/Governance evidence, the location MUST allow constructing a retrieval path  
   (e.g. \\\\EvidenceVault\\CUI-Enclave\\controls\\<ControlId>\\ or governance\\<ControlId>\\).  
   N/A Justification may point to a document (e.g. boundary chapter).

7. **Authority and count (Inquisition 7)**  
   SCTM MUST contain exactly 110 control rows. Evidence index MUST contain exactly 110 controls.  
   Control ID sets MUST match (no missing, no extra).
"""


@dataclass
class ControlResult:
    control_id: str
    inquisition_failures: list[str] = field(default_factory=list)  # e.g. ["I2: placeholder", "I4: status mismatch"]


def load_evidence_index(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_sctm(path: Path) -> list[dict[str, str]]:
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def norm(s: str) -> str:
    return (s or "").strip()


def is_placeholder_location(loc: str) -> bool:
    if not loc:
        return True
    loc_lower = loc.lower()
    if "to be implemented" in loc_lower:
        return True
    if loc_lower.strip() == "evidence vault: /evidence/":
        return True
    return False


def is_actionable_regeneration(regen: str) -> bool:
    if not regen or len(norm(regen)) < 5:
        return False
    r = norm(regen).lower()
    if "collect-cui-evidence" in r or "collect_cui_evidence" in r:
        return True
    if "test-cuihardening" in r or "test_cuihardening" in r:
        return True
    if "evidence_runbook" in r or "evidence runbook" in r or "runbook" in r:
        return True
    if "runbook" in r and "doc" in r:
        return True
    if "version-controlled" in r or "approval record" in r:
        return True
    if "hash" in r and ("store" in r or "vault" in r):
        return True
    if "export" in r and ("entra" in r or "role assignment" in r or "nsg" in r):
        return True
    if "provider" in r or "attestation" in r:
        return True
    if "boundary" in r and ("rationale" in r or "justification" in r):
        return True
    # Generic but acceptable
    if "run " in r and "ps1" in r:
        return True
    return False


def status_expects_system(status: str) -> bool:
    return "Implemented (Evidenced on Pilot VM)" in status


def status_expects_na(status: str) -> bool:
    return "N/A" in status or "Not Applicable" in status


def status_expects_governance(status: str) -> bool:
    return "Governed" in status


def status_expects_inherited(status: str) -> bool:
    return "Inherited" in status


def run_double_blind(trust_codex: Path) -> tuple[list[ControlResult], dict[str, Any], list[str]]:
    evidence_path = trust_codex / "tables" / "evidence-index.json"
    sctm_path = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    if not evidence_path.exists():
        return [], {}, ["ERROR: evidence-index.json not found"]
    if not sctm_path.exists():
        return [], {}, ["ERROR: SCTM_FULL_STATUS_LIST.csv not found"]

    ev = load_evidence_index(evidence_path)
    sctm_rows = load_sctm(sctm_path)
    sctm_by_id = {norm(r.get("control_id") or ""): r for r in sctm_rows if norm(r.get("control_id") or "")}
    controls_ev = ev.get("controls") or []
    ev_by_id = {norm(c.get("control_id_cmmc") or ""): c for c in controls_ev if norm(c.get("control_id_cmmc") or "")}

    global_failures: list[str] = []
    control_results: list[ControlResult] = []

    # Inquisition 7: count and parity
    if len(sctm_rows) != 110:
        global_failures.append(f"I7: SCTM must have 110 controls; found {len(sctm_rows)}")
    if len(controls_ev) != 110:
        global_failures.append(f"I7: Evidence index must have 110 controls; found {len(controls_ev)}")
    sctm_ids = set(sctm_by_id)
    ev_ids = set(ev_by_id)
    if sctm_ids != ev_ids:
        missing_ev = sctm_ids - ev_ids
        extra_ev = ev_ids - sctm_ids
        if missing_ev:
            global_failures.append(f"I7: Evidence index missing controls: {sorted(missing_ev)[:5]}{'...' if len(missing_ev) > 5 else ''}")
        if extra_ev:
            global_failures.append(f"I7: Evidence index has extra controls: {sorted(extra_ev)[:5]}{'...' if len(extra_ev) > 5 else ''}")

    for cid in sorted(sctm_ids | ev_ids):
        if cid not in ev_by_id:
            control_results.append(ControlResult(cid, ["I1: No evidence items in index"]))
            continue
        c = ev_by_id[cid]
        items = c.get("evidence_items") or []
        failures: list[str] = []

        # I1: Coverage
        if not items:
            failures.append("I1: No evidence items")
        for idx, it in enumerate(items):
            if not it:
                failures.append(f"I1: Empty evidence item[{idx}]")
                continue
            loc = norm(it.get("location") or "")
            regen = norm(it.get("regeneration_method") or "")
            etype = norm(it.get("evidence_type") or "")
            owner = norm(it.get("owner_role") or "")

            # I2: Placeholder
            if is_placeholder_location(loc):
                failures.append("I2: Placeholder location")
            # I3: Actionable regeneration
            if not is_actionable_regeneration(regen):
                failures.append("I3: Regeneration not actionable")
            # I5: Traceability (all five)
            if not owner:
                failures.append("I5: Missing owner_role")
            if not etype:
                failures.append("I5: Missing evidence_type")

        # I4: Status–evidence alignment
        srow = sctm_by_id.get(cid) or {}
        status = norm(srow.get("pilot_status") or "")
        if status:
            has_system = any(norm(it.get("evidence_type") or "") == "System" for it in items if it)
            has_governance = any(norm(it.get("evidence_type") or "") == "Governance" for it in items if it)
            has_na = any(norm(it.get("evidence_type") or "") == "N/A Justification" for it in items if it)
            has_inherited = any("Inherited" in norm(it.get("evidence_type") or "") for it in items if it)
            if status_expects_system(status) and not has_system:
                failures.append("I4: Status Implemented but no System evidence")
            if status_expects_na(status) and not has_na:
                failures.append("I4: Status N/A but no N/A Justification evidence")
            if status_expects_governance(status) and not has_governance:
                failures.append("I4: Status Governed but no Governance evidence")
            if status_expects_inherited(status) and not (has_inherited or has_governance):
                failures.append("I4: Status Inherited but no Inherited/Governance evidence")

        # I6: Retrievability (location must look like a path)
        for it in items:
            if not it:
                continue
            loc = norm(it.get("location") or "")
            if loc and not is_placeholder_location(loc):
                if "Evidence vault" in loc or "governance" in loc or "controls" in loc or "chapters" in loc or "TRUST_CODEX" in loc:
                    break
            else:
                if not is_placeholder_location(loc):
                    break
        else:
            if items and any(is_placeholder_location(norm(it.get("location") or "")) for it in items if it):
                pass  # already failed I2
            elif items and not any("Evidence vault" in norm(it.get("location") or "") or "governance" in norm(it.get("location") or "") or "TRUST_CODEX" in norm(it.get("location") or "") for it in items if it):
                # N/A can point to chapter
                if not status_expects_na(status):
                    failures.append("I6: Location not retrievable (no vault/governance/doc path)")

        if failures:
            control_results.append(ControlResult(cid, failures))
        else:
            control_results.append(ControlResult(cid, []))

    # Summary stats
    passed = sum(1 for r in control_results if not r.inquisition_failures)
    failed = len(control_results) - passed
    by_inquisition: dict[str, int] = {}
    for r in control_results:
        for f in r.inquisition_failures:
            key = f.split(":")[0] if ":" in f else f
            by_inquisition[key] = by_inquisition.get(key, 0) + 1

    stats = {
        "total_controls": len(control_results),
        "passed": passed,
        "failed": failed,
        "global_failures": global_failures,
        "by_inquisition": by_inquisition,
    }
    return control_results, stats, global_failures


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    control_results, stats, global_failures = run_double_blind(trust_codex)

    report_dir = trust_codex / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "C3PAO_DOUBLE_BLIND_ASSESSMENT.md"
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    lines = [
        "# C3PAO Double-Blind Assessment — Evidence Readiness for All 110 Controls",
        "",
        f"**Assessment date:** {date_str}",
        "",
        "**Method:** Independent assessor methodology; does not use the internal full-assessment script. Reads only `evidence-index.json` and `SCTM_FULL_STATUS_LIST.csv`.",
        "",
        "---",
        "",
        "## Methodology",
        "",
        METHODOLOGY.strip(),
        "",
        "---",
        "",
        "## Verdict",
        "",
    ]

    if global_failures or stats["failed"] > 0:
        lines.append("**Evidence ready for all 110 controls: NO**")
        lines.append("")
        if global_failures:
            lines.append("**Global failures:**")
            for g in global_failures:
                lines.append(f"- {g}")
            lines.append("")
        lines.append(f"**Controls with one or more inquisition failures:** {stats['failed']} of {stats['total_controls']}.")
    else:
        lines.append("**Evidence ready for all 110 controls: YES**")
        lines.append("")
        lines.append("All 110 controls passed the seven inquisitions. Evidence index and SCTM are aligned; locations are non-placeholder; regeneration methods are actionable; status–evidence alignment holds.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Summary by inquisition")
    lines.append("")
    lines.append("| Inquisition | Description | Failures |")
    lines.append("|-------------|-------------|----------|")
    lines.append("| I1 | Coverage (≥1 evidence item per control) | " + str(stats["by_inquisition"].get("I1", 0)) + " |")
    lines.append("| I2 | No placeholder locations | " + str(stats["by_inquisition"].get("I2", 0)) + " |")
    lines.append("| I3 | Actionable regeneration method | " + str(stats["by_inquisition"].get("I3", 0)) + " |")
    lines.append("| I4 | Status–evidence alignment | " + str(stats["by_inquisition"].get("I4", 0)) + " |")
    lines.append("| I5 | Traceability (owner, type, location, regeneration) | " + str(stats["by_inquisition"].get("I5", 0)) + " |")
    lines.append("| I6 | Retrievability (vault/governance/doc path) | " + str(stats["by_inquisition"].get("I6", 0)) + " |")
    lines.append("| I7 | Authority and count (110 controls, SCTM = index) | " + str(len(global_failures)) + " (global) |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Per-control results (failures only)")
    lines.append("")

    failed_controls = [r for r in control_results if r.inquisition_failures]
    if not failed_controls:
        lines.append("No control-level failures. All 110 controls passed.")
    else:
        lines.append("| Control ID | Inquisition failures |")
        lines.append("|------------|----------------------|")
        for r in sorted(failed_controls, key=lambda x: x.control_id):
            lines.append(f"| {r.control_id} | {'; '.join(r.inquisition_failures)} |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Sample « Show me the evidence » (random 12 controls)")
    lines.append("")
    sample = random.Random(42).sample([r for r in control_results if not r.inquisition_failures], min(12, stats["passed"]))
    if sample:
        lines.append("| Control ID | Evidence type | Location (from index) | Regeneration |")
        lines.append("|------------|---------------|------------------------|--------------|")
        ev = load_evidence_index(trust_codex / "tables" / "evidence-index.json")
        ev_by_id = {norm(c.get("control_id_cmmc") or ""): c for c in (ev.get("controls") or [])}
        for r in sample:
            c = ev_by_id.get(r.control_id, {})
            items = c.get("evidence_items") or []
            it = items[0] if items else {}
            loc = (it.get("location") or "").replace("\\\\", "\\")[:50]
            regen = (it.get("regeneration_method") or "")[:55]
            etype = it.get("evidence_type") or ""
            lines.append(f"| {r.control_id} | {etype} | {loc}... | {regen}... |")
    else:
        lines.append("(No passed controls to sample.)")
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {report_path}")
    print(f"Verdict: {'PASS (evidence ready for all 110)' if not global_failures and stats['failed'] == 0 else 'FAIL'}")
    if failed_controls:
        print(f"Failed controls: {[r.control_id for r in failed_controls]}")
    return 2 if (global_failures or stats["failed"] > 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
