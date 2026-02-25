#!/usr/bin/env python3
"""
Build control implementation mapping artifacts for the Trust Codex pilot.

Outputs:
- TRUST_CODEX/vm-scripts/control-implementation-map.json
- TRUST_CODEX/tables/CONTROL_IMPLEMENTATION_MAP.md

The goal is to make explicit where a requirement is enforced:
- vm_local: Windows VM local policy / registry / services / audit
- azure_resource: Azure resources (VNet/NSG/VPN+RDP access/Disks/Monitor/Backup/etc)
- entra_tenant: Microsoft Entra ID / Conditional Access / PIM / MFA
- process_only: governance/operational process (humans + records)
- azure_platform_inherited: inherited from Microsoft Azure platform (physical/hypervisor/DC ops)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


Domain = Literal["vm_local", "azure_resource", "entra_tenant", "process_only", "azure_platform_inherited", "shared"]


@dataclass(frozen=True)
class MapRow:
    control_id: str
    family: str
    title: str
    implementation_domain: Domain
    responsibility: Literal["customer", "provider", "shared"]
    inheritance_source: str
    hardening_actions: list[str]
    validator_check_ids: list[str]
    evidence_artifacts: list[str]
    notes: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_manual_controls(trust_codex_dir: Path) -> list[dict[str, Any]]:
    p = trust_codex_dir / "manual_app" / "manual-data.json"
    obj = json.loads(p.read_text(encoding="utf-8"))
    return list(obj.get("controls") or [])


def infer_domain(control_id: str, family: str, title: str) -> tuple[Domain, str, str]:
    """
    Heuristic domain inference. We intentionally err on the side of 'shared' if ambiguous.
    """
    cid = control_id
    fam = family.upper().strip()
    t = (title or "").lower()

    # Explicit tenant/Entra controls (cannot be proven or enforced purely in-VM).
    if cid in {
        "IA.L2-3.5.3",
        "IA.L2-3.5.4",
        "IA.L2-3.5.5",
        "IA.L2-3.5.6",
        "MA.L2-3.7.5",
    }:
        return "entra_tenant", "shared", "Microsoft Entra ID (tenant controls)"

    # Architecture/subnetworks/key management are primarily Azure-side in this enclave pattern.
    if cid in {
        "SC.L2-3.13.5",  # subnetworks
        "SC.L2-3.13.10",  # key management
    }:
        return "azure_resource", "shared", "Microsoft Azure (resource configuration)"

    # Physical/Platform inheritance isn't in the 80 Class A set today, but keep for completeness.
    if "physical" in t or "facility" in t:
        return "azure_platform_inherited", "provider", "Microsoft Azure (physical datacenter/platform)"

    # Strong VM-local items
    if cid in {
        "AC.L2-3.1.8",
        "AC.L2-3.1.9",
        "AC.L2-3.1.10",
        "AC.L2-3.1.11",
        "IA.L2-3.5.7",
        "IA.L2-3.5.8",
        "IA.L2-3.5.11",
        "SC.L2-3.13.11",
    }:
        return "vm_local", "customer", ""

    # Default by family
    if fam in {"AU", "SI"}:
        return "shared", "shared", "Windows VM + Azure Monitor/SIEM (shared)"
    if fam in {"SC"}:
        return "shared", "shared", "Network boundary is VM+Azure (shared)"
    if fam in {"AC"}:
        return "shared", "shared", "Access path is VM+Azure+Entra (shared)"
    if fam in {"CM"}:
        return "vm_local", "customer", ""
    if fam in {"IA"}:
        return "shared", "shared", "Identity is VM+Entra (shared)"
    if fam in {"MA", "MP", "RA"}:
        return "shared", "shared", "Operational + VM + Azure (shared)"
    return "shared", "shared", ""


def main() -> int:
    trust_codex_dir = Path(__file__).resolve().parents[1]
    controls = load_manual_controls(trust_codex_dir)
    class_a = [c for c in controls if "System-Enforced" in str(c.get("classification") or "")]

    # Known validator check IDs (from Test-CuiHardening.ps1). We only link what exists today.
    # This is a hint map; scripts evolve over time.
    check_hint = {
        "AC.L2-3.1.3": ["RDP-REDIR"],
        "AC.L2-3.1.8": ["LOCKOUT"],
        "AC.L2-3.1.9": ["LEGALNOTICE"],
        "AC.L2-3.1.10": ["SESSION-LOCK"],
        "AC.L2-3.1.11": ["INACTIVITY"],
        "AC.L2-3.1.12": ["RM-WINRM"],
        "AC.L2-3.1.21": ["PORTABLE-STORAGE"],
        "AU.L2-3.3.1": ["AU-SECLOG", "AU-AUDITPOL"],
        "AU.L2-3.3.7": ["TIME-SYNC"],
        "CM.L2-3.4.2": ["SECPOL-EXPORTED", "SECPOL-PARSED"],
        "IA.L2-3.5.1": ["GUEST-DISABLED", "NO-AUTOLOGON"],
        "IA.L2-3.5.10": ["NTLMV2"],
        "IA.L2-3.5.11": ["AUTH-UX"],
        "SC.L2-3.13.1": ["NET-FW", "SMB-SIGN"],
        "SC.L2-3.13.6": ["NET-FW"],
        "SC.L2-3.13.8": ["CRYPTO-TLS"],
        "SC.L2-3.13.11": ["CRYPTO-FIPS"],
        "SI.L2-3.14.1": ["WU-SERVICES"],
        "SI.L2-3.14.2": ["DEFENDER-ON"],
        "SI.L2-3.14.4": ["DEFENDER-UPDATES"],
        "SI.L2-3.14.6": ["LSA-PPL"],
        "MP.L2-3.8.7": ["USBSTOR"],
    }

    # Strong recommended actions (used for docs; scripts may implement subset depending on mode).
    action_hint = {
        "AC.L2-3.1.3": [
            "VM: Enforce RDP redirection restrictions (clipboard/drive) + NLA.",
            "Azure: Restrict egress (NSG/Azure Firewall) and keep admin access Bastion-only.",
        ],
        "AC.L2-3.1.21": ["VM: Disable USB mass storage (USBSTOR) + removable storage policies."],
        "AU.L2-3.3.1": ["VM: Enable audit policy; ensure event logs enabled/retained.", "Azure: Export/send logs to Log Analytics/SIEM (optional)."],
        "AU.L2-3.3.7": ["VM: Ensure W32Time running and time source not Local CMOS Clock."],
        "CM.L2-3.4.2": ["VM: Maintain hardened local security policy baseline (secpol.cfg export)."],
        "IA.L2-3.5.10": ["VM: Enforce NTLMv2-only posture; disable LM hashes.", "Entra: Prefer modern auth where applicable."],
        "IA.L2-3.5.11": ["VM: DontDisplayLastUserName=1."],
        "SC.L2-3.13.1": ["Azure: Enforce network boundary via VNet/NSG; no public RDP.", "VM: Firewall baseline + SMB signing required."],
        "SC.L2-3.13.11": ["VM: FIPS enabled."],
        "SI.L2-3.14.2": ["VM: Defender enabled; ASR rules where applicable.", "Azure: Defender for Cloud (optional)."],
        "SI.L2-3.14.4": ["VM: Defender signatures updated (age threshold)."],
    }

    rows: list[MapRow] = []
    for c in sorted(class_a, key=lambda x: str(x.get("control_id") or "")):
        cid = str(c.get("control_id") or "").strip()
        fam = str(c.get("family") or "").strip()
        title = str(c.get("title") or "").strip()
        dom, resp, inh = infer_domain(cid, fam, title)

        hard_actions = action_hint.get(cid) or []
        if not hard_actions:
            # Default suggestion from domain
            if dom == "vm_local":
                hard_actions = ["VM: Configure local policy/registry/services to satisfy this requirement where applicable."]
            elif dom == "azure_resource":
                hard_actions = ["Azure: Configure resource controls (NSG/VPN+RDP access/Disks/Monitor/Backup) to satisfy this requirement."]
            elif dom == "entra_tenant":
                hard_actions = ["Entra: Configure tenant controls (MFA/Conditional Access/PIM) to satisfy this requirement."]
            elif dom == "process_only":
                hard_actions = ["Process: Document and operate this requirement with governance records."]
            else:
                hard_actions = ["Shared: Requires a combination of VM, Azure, and/or Entra enforcement + records."]

        # Evidence artifacts: reuse Evidence Index pointers when present
        ev = c.get("evidence") or {}
        ev_files = []
        loc = str(ev.get("location") or "")
        if loc:
            ev_files.append(loc)
        regen = str(ev.get("regeneration_method") or "")
        if regen:
            ev_files.append(f"Regeneration: {regen}")

        rows.append(
            MapRow(
                control_id=cid,
                family=fam,
                title=title,
                implementation_domain=dom,
                responsibility=resp,  # type: ignore[arg-type]
                inheritance_source=inh,
                hardening_actions=hard_actions,
                validator_check_ids=check_hint.get(cid) or [],
                evidence_artifacts=ev_files,
                notes="",
            )
        )

    out_json = trust_codex_dir / "vm-scripts" / "control-implementation-map.json"
    out_md = trust_codex_dir / "tables" / "CONTROL_IMPLEMENTATION_MAP.md"

    obj = {
        "schema": "mactech.codex.control_implementation_map",
        "version": 1,
        "generated_utc": utc_now_iso(),
        "source": {"manual_data": "manual_app/manual-data.json"},
        "counts": {"class_a_total": len(rows)},
        "domains": ["vm_local", "azure_resource", "entra_tenant", "process_only", "azure_platform_inherited", "shared"],
        "controls": [r.__dict__ for r in rows],
    }
    out_json.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")

    # Markdown summary
    by_domain: dict[str, list[MapRow]] = {}
    for r in rows:
        by_domain.setdefault(r.implementation_domain, []).append(r)

    lines: list[str] = []
    lines.append("# Control implementation map — System-Enforced (Class A)")
    lines.append("")
    lines.append(f"Generated: `{obj['generated_utc']}`")
    lines.append("")
    lines.append("This map explains where each requirement is enforced (VM vs Azure vs Entra) and what evidence/checks support it.")
    lines.append("")
    lines.append("## Domains (summary)")
    lines.append("")
    for d in sorted(by_domain.keys()):
        lines.append(f"- **{d}**: {len(by_domain[d])}")
    lines.append("")

    lines.append("## Controls (grouped by domain)")
    lines.append("")
    for d in sorted(by_domain.keys()):
        lines.append(f"### {d}")
        lines.append("")
        for r in sorted(by_domain[d], key=lambda x: x.control_id):
            chk = ", ".join(r.validator_check_ids) if r.validator_check_ids else "—"
            inh = f" · inherited: {r.inheritance_source}" if r.inheritance_source else ""
            lines.append(f"- **{r.control_id}** ({r.family}) — {r.title}  ")
            lines.append(f"  - responsibility: **{r.responsibility}**{inh}")
            lines.append(f"  - validator checks: `{chk}`")
        lines.append("")

    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

