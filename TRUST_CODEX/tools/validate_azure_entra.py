#!/usr/bin/env python3
"""
Validate the 7 Azure/Entra controls from collected artifacts (same logic as Test-AzureEntraControls.ps1).
Use after export_azure_evidence.sh so validation can run off-VM (e.g. on Mac with az login).

Usage:
  python TRUST_CODEX/tools/validate_azure_entra.py [--artifact-dir evidence/runs/<RunId>/raw/azure] [--out-dir evidence/runs/<RunId>/raw/CUI-Validation-AzureEntra-<RunId>]
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


CONTROLS = [
    ("IA.L2-3.5.3", "MFA for privileged accounts"),
    ("IA.L2-3.5.4", "Replay-resistant authentication"),
    ("IA.L2-3.5.5", "Prevent identifier reuse"),
    ("IA.L2-3.5.6", "Disable identifiers after inactivity"),
    ("MA.L2-3.7.5", "MFA for nonlocal maintenance"),
    ("SC.L2-3.13.10", "Cryptographic key management"),
    ("SC.L2-3.13.5", "Implement subnetworks"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate Azure/Entra 7 controls from artifact dir")
    ap.add_argument("--artifact-dir", default="", help="Dir with role-assignments-all.json, entra-signin.json, keyvault-list.json, nsg-list.json, etc.")
    ap.add_argument("--out-dir", default="", help="Dir for validation-report-azure-entra.txt/json; default: artifact_dir/../CUI-Validation-AzureEntra-<RunId>")
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parents[1].parent
    trust_codex = repo_root / "TRUST_CODEX"
    runs = repo_root / "evidence" / "runs"

    if args.artifact_dir:
        artifact_dir = Path(args.artifact_dir).resolve()
    else:
        # Latest run's raw/azure
        if not runs.exists():
            print("No evidence/runs found. Run export_azure_evidence.sh or pass --artifact-dir.")
            return 1
        run_dirs = sorted(runs.iterdir(), key=lambda p: p.name, reverse=True)
        for r in run_dirs:
            if not r.is_dir():
                continue
            azure_dir = r / "raw" / "azure"
            if azure_dir.exists():
                artifact_dir = azure_dir
                break
        else:
            print("No raw/azure dir found. Pass --artifact-dir or run export_azure_evidence.sh first.")
            return 1

    if not artifact_dir.exists():
        print(f"Artifact dir not found: {artifact_dir}")
        return 1

    run_id = artifact_dir.parent.parent.name if "runs" in artifact_dir.parts else datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if args.out_dir:
        out_dir = Path(args.out_dir).resolve()
    else:
        out_dir = artifact_dir.parent / f"CUI-Validation-AzureEntra-{run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)

    def read_json(name: str) -> list | dict | None:
        p = artifact_dir / name
        if not p.is_file():
            return None
        try:
            raw = p.read_text(encoding="utf-8").strip()
            if not raw or raw == "[]":
                return []
            return json.loads(raw)
        except Exception:
            return None

    def has_artifact(name: str) -> bool:
        data = read_json(name)
        if data is None:
            return False
        if isinstance(data, list):
            return len(data) > 0
        return bool(data)

    # ---- Checks (mirror Test-AzureEntraControls.ps1) ----
    checks = []

    signin = read_json("entra-signin.json")
    has_signin = isinstance(signin, list) and len(signin) > 0
    mfa_policy = any((artifact_dir / n).exists() for n in ("conditional-access-policies.json", "mfa-policy.json", "conditional-access-export.json"))
    has_mfa_policy = mfa_policy

    # MFA/Entra must be in the enclave access path (not just evidence artifacts). Without this,
    # SSH key + RDP local = MFA-less access and controls are NOT satisfied.
    mfa_in_path_file = artifact_dir / "mfa-in-path-attested.txt"
    mfa_in_path_attested = mfa_in_path_file.exists() and bool(mfa_in_path_file.read_text(encoding="utf-8").strip())

    # IA.L2-3.5.3, MA.L2-3.7.5 — require evidence AND MFA-in-path attestation
    mfa_evidence_ok = has_signin or has_mfa_policy
    checks.append({
        "id": "ENTRA-MFA",
        "control": "IA.L2-3.5.3",
        "title": "MFA for privileged accounts (Entra evidence)",
        "pass": mfa_evidence_ok and mfa_in_path_attested,
        "observed": f"Sign-in/CA evidence={mfa_evidence_ok}; MFA in access path attested={mfa_in_path_attested}",
        "expected": "entra-signin or CA policy export present AND mfa-in-path-attested.txt (MFA in enclave access path)",
        "evidence_hint": "entra-signin.json; Conditional Access export; mfa-in-path-attested.txt (add when VPN+Entra or Azure AD login for RDP)",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    })
    checks.append({
        "id": "ENTRA-MFA-MA",
        "control": "MA.L2-3.7.5",
        "title": "MFA for nonlocal maintenance (Entra evidence)",
        "pass": mfa_evidence_ok and mfa_in_path_attested,
        "observed": f"Sign-in/CA evidence={mfa_evidence_ok}; MFA in access path attested={mfa_in_path_attested}",
        "expected": "Entra/MFA evidence AND mfa-in-path-attested.txt (MFA in enclave access path)",
        "evidence_hint": "entra-signin.json; MFA policy; mfa-in-path-attested.txt",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    })

    # IA.L2-3.5.4, 3.5.5, 3.5.6 — require Entra/role evidence AND MFA-in-path attestation
    entra_evidence = has_signin or has_artifact("role-assignments-all.json")
    for cid, title in [("IA.L2-3.5.4", "Replay-resistant authentication"), ("IA.L2-3.5.5", "Prevent identifier reuse"), ("IA.L2-3.5.6", "Disable identifiers after inactivity")]:
        eid = "ENTRA-REPLAY" if cid == "IA.L2-3.5.4" else "ENTRA-NO-REUSE" if cid == "IA.L2-3.5.5" else "ENTRA-INACTIVITY"
        checks.append({
            "id": eid,
            "control": cid,
            "title": title + " (Entra evidence)",
            "pass": entra_evidence and mfa_in_path_attested,
            "observed": f"Entra/role evidence={entra_evidence}; MFA in access path attested={mfa_in_path_attested}",
            "expected": "Entra/role evidence AND mfa-in-path-attested.txt (MFA in enclave access path)",
            "evidence_hint": "entra-signin.json; role-assignments-all.json; mfa-in-path-attested.txt",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        })

    # SC.L2-3.13.10
    has_kv = has_artifact("keyvault-list.json")
    checks.append({
        "id": "AZ-KEYVAULT",
        "control": "SC.L2-3.13.10",
        "title": "Cryptographic key management (Azure Key Vault evidence)",
        "pass": has_kv,
        "observed": f"keyvault-list.json present and non-empty={has_kv}",
        "expected": "Azure Key Vault list or key management artifact",
        "evidence_hint": "keyvault-list.json; or document key management approach",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    })

    # SC.L2-3.13.5: NSG present and RDP (3389) not effectively allowed from 0.0.0.0/0 (Deny wins by priority)
    has_nsg = has_artifact("nsg-list.json")
    rdp_open_public = False
    if has_nsg:
        for f in artifact_dir.glob("nsg-rules-*.json"):
            try:
                rules = json.loads(f.read_text(encoding="utf-8"))
                if not isinstance(rules, list):
                    continue
                # Inbound rules for port 3389 from 0.0.0.0/0 or *; first match by priority wins
                rdp_rules = []
                for r in rules:
                    port = str(r.get("destinationPortRange") or "")
                    if "3389" not in port:
                        continue
                    src = r.get("sourceAddressPrefix") or (r.get("sourceAddressPrefixes") or [])
                    if isinstance(src, list):
                        src_ok = "*" in src or "0.0.0.0/0" in src
                    else:
                        src_ok = src in ("*", "0.0.0.0/0")
                    if not src_ok:
                        continue
                    rdp_rules.append((int(r.get("priority") or 65535), str(r.get("access") or "").lower()))
                rdp_rules.sort(key=lambda x: x[0])
                if rdp_rules and rdp_rules[0][1] == "allow":
                    rdp_open_public = True
                    break
            except Exception:
                pass
    checks.append({
        "id": "AZ-NSG",
        "control": "SC.L2-3.13.5",
        "title": "Implement subnetworks (NSG evidence)",
        "pass": has_nsg and not rdp_open_public,
        "observed": f"NSG list present={has_nsg}; RDP open to 0.0.0.0/0={rdp_open_public}",
        "expected": "NSG list/rules present; RDP (3389) not allowed from 0.0.0.0/0",
        "evidence_hint": "nsg-list.json; nsg-rules-*.json",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    })

    pass_count = sum(1 for c in checks if c["pass"])
    fail_count = len(checks) - pass_count
    generated = datetime.now(timezone.utc).isoformat()

    summary = {
        "generated_utc": generated,
        "computer": os.environ.get("COMPUTERNAME", os.uname().nodename if hasattr(os, "uname") else "unknown"),
        "user": os.environ.get("USER", os.environ.get("USERNAME", "unknown")),
        "azure_entra_dir": str(artifact_dir),
        "pass_count": pass_count,
        "fail_count": fail_count,
        "total": len(checks),
        "control_ids": [c[0] for c in CONTROLS],
    }

    # .txt
    txt_path = out_dir / "validation-report-azure-entra.txt"
    lines = [
        "CUI Pilot — Azure/Entra 7-Controls Validation Report (read-only)",
        f"Generated (UTC): {summary['generated_utc']}",
        "",
        "Caveat: The five IA/MA checks (3.5.3, 3.5.4, 3.5.5, 3.5.6, MA 3.7.5) require evidence artifacts",
        "AND mfa-in-path-attested.txt (MFA in enclave access path). Without that file they FAIL (2 PASS,",
        "5 FAIL). See reports/AZURE_ENTRA_FIVE_CONTROLS_COMPLIANCE_STATUS.md and EVIDENCE_RUNBOOK §5a.",
        f"Computer: {summary['computer']}",
        f"User: {summary['user']}",
        f"Azure/Entra artifact dir: {summary['azure_entra_dir']}",
        f"PASS: {pass_count}  FAIL: {fail_count}  TOTAL: {len(checks)}",
        "",
        "Checks:",
    ]
    for c in checks:
        status = "PASS" if c["pass"] else "FAIL"
        lines.append(f"[{status}] {c['title']} ({c['control']}) - {c['id']} | Observed: {c['observed']} | Expected: {c['expected']} | Evidence: {c['evidence_hint']}")
    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # .json
    json_path = out_dir / "validation-report-azure-entra.json"
    json_path.write_text(
        json.dumps({"summary": summary, "checks": checks, "azure_entra_dir": str(artifact_dir)}, indent=2),
        encoding="utf-8",
    )

    print(f"Wrote: {txt_path}")
    print(f"Wrote: {json_path}")
    print(f"PASS: {pass_count}  FAIL: {fail_count}  TOTAL: {len(checks)}")
    return 0 if fail_count == 0 else 0  # exit 0 either way so runbook continues


if __name__ == "__main__":
    raise SystemExit(main())
