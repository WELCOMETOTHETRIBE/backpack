#!/usr/bin/env python3
"""
C3PAO Full Assessment: run all consistency checks and document findings.

Produces TRUST_CODEX/reports/C3PAO_FULL_ASSESSMENT_FINDINGS.md with
ERROR / WARN / INFO findings. Use findings to bolster configuration and evidence generation.
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Finding:
    level: str  # ERROR | WARN | INFO
    category: str  # e.g. "Evidence Index", "Documentation", "VM scripts"
    message: str
    remediation: str = ""


def run_validation(trust_codex: Path) -> list[Finding]:
    """Run validate_codex_data.py and convert exit code to finding."""
    findings: list[Finding] = []
    result = subprocess.run(
        [sys.executable, str(trust_codex / "tools" / "validate_codex_data.py")],
        cwd=trust_codex.parent,
        capture_output=True,
        text=True,
        env={**__import__("os").environ, "TRUST_CODEX_DIR": str(trust_codex)},
    )
    if result.returncode != 0:
        findings.append(
            Finding(
                "ERROR",
                "Data consistency",
                "validate_codex_data.py failed. " + (result.stdout or result.stderr or "")[:500],
                "Fix schema/control count/placeholder issues; re-run validation.",
            )
        )
    return findings


def check_required_docs(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    required = [
        ("docs/EVIDENCE_RUNBOOK.md", "Evidence Runbook", "Exact commands for VM, Entra, role assignments, NSG."),
        ("docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md", "Technical gaps", "RDP/inactivity/validator-claim rule."),
        ("tables/CLASS_B_EVIDENCE_OPERATIONS.md", "Class B operations", "Required records, cadence, vault paths."),
        ("vault/VAULT_LAYOUT.md", "Vault layout", "Append-only layout and paths."),
        ("docs/C3PAO_READINESS.md", "C3PAO one-pager", "Assessor entry point."),
    ]
    for rel, name, _ in required:
        p = trust_codex / Path(rel)
        if not p.exists():
            findings.append(Finding("ERROR", "Documentation", f"Missing required doc: {rel} ({name})", f"Add {rel}."))
    return findings


def check_vm_scripts(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    scripts = [
        "vm-scripts/Collect-Cui-Evidence.ps1",
        "vm-scripts/Test-CuiHardening.ps1",
        "vm-scripts/Invoke-CuiHardening.ps1",
        "vault/Sync-EvidenceToVault.ps1",
    ]
    for rel in scripts:
        if not (trust_codex / rel).exists():
            findings.append(Finding("ERROR", "VM scripts", f"Missing script: {rel}", f"Add or restore {rel}."))
    return findings


def check_evidence_index_completeness(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    path = trust_codex / "tables" / "evidence-index.json"
    if not path.exists():
        findings.append(Finding("ERROR", "Evidence Index", "evidence-index.json not found", "Create index."))
        return findings
    data = json.loads(path.read_text(encoding="utf-8"))
    controls = data.get("controls") or []
    missing_regen = []
    placeholder_locs = []
    for c in controls:
        cid = (c.get("control_id_cmmc") or "").strip()
        for item in c.get("evidence_items") or []:
            if not item:
                continue
            loc = (item.get("location") or "").lower()
            if "to be implemented" in loc or "/evidence/" in loc:
                placeholder_locs.append(cid)
            regen = (item.get("regeneration_method") or "").strip()
            if not regen:
                missing_regen.append(cid)
    if placeholder_locs:
        findings.append(
            Finding(
                "ERROR",
                "Evidence Index",
                f"Placeholder location still present for: {placeholder_locs[:5]}{' ...' if len(placeholder_locs) > 5 else ''}",
                "Replace with real vault paths in evidence-index.json.",
            )
        )
    if missing_regen:
        findings.append(
            Finding(
                "WARN",
                "Evidence Index",
                f"Missing regeneration_method for: {list(dict.fromkeys(missing_regen))[:5]}{' ...' if len(missing_regen) > 5 else ''}",
                "Add regeneration_method per control in evidence-index.json.",
            )
        )
    return findings


def check_bastion_references(trust_codex: Path) -> list[Finding]:
    """WARN if key narrative docs still say Bastion (access path is VPN + RDP)."""
    findings: list[Finding] = []
    # Only scan narrative/source docs we intend to keep aligned with VPN+RDP
    scan_dirs = ["chapters", "README.md", "tables/VM_EVIDENCED_CLASS_A_CONTROLS.md"]
    bastion_files: list[str] = []
    for entry in scan_dirs:
        p = trust_codex / entry
        if p.is_file():
            if "Bastion" in p.read_text(encoding="utf-8"):
                bastion_files.append(entry)
        elif p.is_dir():
            for f in p.glob("*.md"):
                if "Bastion" in f.read_text(encoding="utf-8"):
                    bastion_files.append(str(f.relative_to(trust_codex)))
    if bastion_files:
        findings.append(
            Finding(
                "WARN",
                "Documentation",
                f"Bastion still referenced in narrative (access path is VPN + RDP): {bastion_files[:12]}{' ...' if len(bastion_files) > 12 else ''}",
                "Update to VPN + RDP (or 'controlled access path') for assessor consistency.",
            )
        )
    return findings


def check_sctm_status_values(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    path = trust_codex / "tables" / "SCTM_FULL_STATUS_LIST.csv"
    if not path.exists():
        return findings
    allowed = {"Implemented (Evidenced on Pilot VM)", "Governed (Docs Present; Records Pending)", "Governed (Records Attached)", "N/A (Documented)", "Planned / Partially Evidenced", "Not Implemented", "Inherited", "Inherited (Evidence Pending)"}
    with path.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        col = "pilot_status"
        for row in r:
            status = (row.get(col) or "").strip()
            if status and status not in allowed:
                findings.append(
                    Finding("INFO", "SCTM", f"Non-standard pilot_status: '{status}' for {row.get('control_id', '?')}", "Consider aligning to standard status set.")
                )
    return findings


def check_control_mapping_coverage(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    path = trust_codex / "tables" / "CONTROL_MAPPING_800-171R2.md"
    if not path.exists():
        return findings
    text = path.read_text(encoding="utf-8")
    # Count table rows that look like control rows (e.g. | AC.L2-3.1.1 |)
    rows = [l for l in text.splitlines() if re.search(r"\|\s*[A-Z]{2}\.L2-3\.\d+\.\d+", l)]
    if len(rows) < 100:
        findings.append(
            Finding("WARN", "Control mapping", f"CONTROL_MAPPING_800-171R2.md has {len(rows)} control rows (expected ~110)", "Add missing control rows.")
        )
    return findings


def check_runbook_covers_index(trust_codex: Path) -> list[Finding]:
    findings: list[Finding] = []
    runbook = trust_codex / "docs" / "EVIDENCE_RUNBOOK.md"
    if not runbook.exists():
        return findings
    text = runbook.read_text(encoding="utf-8")
    required_phrases = [
        "Collect-Cui-Evidence",
        "Entra",
        "role assignment",
        "NSG",
        "hashes",
        "Sync-EvidenceToVault",
    ]
    missing = [p for p in required_phrases if p.lower() not in text.lower()]
    if missing:
        findings.append(
            Finding("WARN", "Evidence Runbook", f"Runbook does not mention: {missing}", "Add steps or references for these evidence types.")
        )
    return findings


def check_evidence_verifiability(trust_codex: Path) -> tuple[list[Finding], dict[str, Any]]:
    """
    Ensure evidence is verifiable (defined, regenerable per runbook) not assumed.
    Returns (findings, summary_dict with verifiable_count, assumed_count, assumed_cids).
    """
    findings: list[Finding] = []
    summary: dict[str, Any] = {"verifiable_count": 0, "assumed_count": 0, "assumed_cids": [], "total": 0}

    path = trust_codex / "tables" / "evidence-index.json"
    if not path.exists():
        return findings, summary

    data = json.loads(path.read_text(encoding="utf-8"))
    controls = data.get("controls") or []
    summary["total"] = len(controls)

    # Actionable regeneration_method: contains concrete verbs or references
    def is_actionable(regen: str) -> bool:
        if not regen or len(regen.strip()) < 15:
            return False
        r = regen.lower()
        if "to be implemented" in r or "tbd" in r or "pending" in r:
            return False
        return any(
            x in r
            for x in [
                "run ",
                "export",
                "collect",
                "hash",
                "store",
                "per docs",
                "version-controlled",
                "approval record",
                "update ",
            ]
        )

    # Real location: not placeholder. Accept vault, VM evidence path, governance, or TRUST_CODEX doc.
    def is_real_location(loc: str) -> bool:
        if not loc:
            return False
        loc_l = loc.lower()
        if "to be implemented" in loc_l or (loc_l.strip() == "/evidence/" or loc_l.strip() == "evidence vault: /evidence/"):
            return False
        return (
            "evidencevault" in loc_l
            or "vault" in loc_l
            or "trust_codex" in loc_l
            or "c:\\evidence" in loc_l
            or "c:/evidence" in loc_l
            or "governance" in loc_l
        )

    for c in controls:
        cid = (c.get("control_id_cmmc") or "").strip()
        if not cid:
            continue
        items = c.get("evidence_items") or []
        if not items:
            summary["assumed_count"] += 1
            summary["assumed_cids"].append(cid)
            continue
        verifiable = True
        for item in items:
            loc = (item.get("location") or "").strip()
            regen = (item.get("regeneration_method") or "").strip()
            if not is_real_location(loc):
                verifiable = False
                break
            if not is_actionable(regen):
                verifiable = False
                break
        if verifiable:
            summary["verifiable_count"] += 1
        else:
            summary["assumed_count"] += 1
            summary["assumed_cids"].append(cid)

    if summary["assumed_count"] > 0:
        sample = summary["assumed_cids"][:10]
        sample_str = ", ".join(sample) + (" ..." if len(summary["assumed_cids"]) > 10 else "")
        findings.append(
            Finding(
                "WARN",
                "Evidence verifiability",
                f"{summary['assumed_count']} control(s) have evidence that is not verifiable (missing/placeholder location or vague regeneration_method): {sample_str}",
                "Set real vault path and actionable regeneration_method (Run/Export/hash/store or per docs) for every control.",
            )
        )

    return findings, summary


def main() -> int:
    trust_codex = Path(__file__).resolve().parents[1]
    if not (trust_codex / "tables" / "evidence-index.json").exists():
        print("ERROR: TRUST_CODEX/tables/evidence-index.json not found. Run from repo root or set TRUST_CODEX.")
        return 2

    all_findings: list[Finding] = []
    all_findings += run_validation(trust_codex)
    all_findings += check_required_docs(trust_codex)
    all_findings += check_vm_scripts(trust_codex)
    all_findings += check_evidence_index_completeness(trust_codex)
    all_findings += check_bastion_references(trust_codex)
    all_findings += check_runbook_covers_index(trust_codex)
    all_findings += check_sctm_status_values(trust_codex)
    all_findings += check_control_mapping_coverage(trust_codex)

    verif_findings, verif_summary = check_evidence_verifiability(trust_codex)
    all_findings += verif_findings

    # Write report
    report_dir = trust_codex / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "C3PAO_FULL_ASSESSMENT_FINDINGS.md"
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [
        "# C3PAO Full Assessment Findings",
        "",
        f"**Assessment date:** {date_str}",
        "",
        "Use these findings to bolster configuration and evidence generation. Fix ERRORs first, then WARNs.",
        "",
        "---",
        "",
        "## Summary",
        "",
        f"- **ERROR:** {len([f for f in all_findings if f.level == 'ERROR'])}",
        f"- **WARN:** {len([f for f in all_findings if f.level == 'WARN'])}",
        f"- **INFO:** {len([f for f in all_findings if f.level == 'INFO'])}",
        "",
        "---",
        "",
        "## Evidence verifiability",
        "",
    ]
    v = verif_summary.get("verifiable_count", 0)
    t = verif_summary.get("total", 0)
    lines.append(f"- **{v} / {t}** controls have **verifiable** evidence (real vault location + actionable regeneration method).")
    lines.append("- Verifiable = defined and regenerable per runbook; not assumed. Actual artifacts require running the runbook.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    if not all_findings:
        lines.append("No ERROR, WARN, or INFO findings. Data consistency, required docs, VM scripts, evidence index, runbook coverage, and narrative (Bastion → VPN + RDP) are aligned.")
        lines.append("")
        lines.append("**Evidence generation:** Follow `docs/EVIDENCE_RUNBOOK.md`; vault layout references it in `vault/VAULT_LAYOUT.md`. Produce actual artifacts by running the runbook (VM collectors, Entra/role exports, sync to vault).")
        lines.append("")
    for level in ("ERROR", "WARN", "INFO"):
        level_findings = [f for f in all_findings if f.level == level]
        if not level_findings:
            continue
        lines.append(f"### {level}")
        lines.append("")
        for f in level_findings:
            lines.append(f"| **{f.category}** | {f.message} |")
            if f.remediation:
                lines.append(f"| Remediation | {f.remediation} |")
            lines.append("")
        lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {report_path}")

    # Exit with error if any ERRORs
    errors = [f for f in all_findings if f.level == "ERROR"]
    for f in errors:
        print(f"ERROR: [{f.category}] {f.message}")
    return 2 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
