#!/usr/bin/env python3
"""
Validate the 8 Azure/Entra controls from collected artifacts (same logic as Test-AzureEntraControls.ps1).
Includes AC.L2-3.1.14 (Remote Access Routing) when NSG + Entra evidence show managed access points.
Use after export_azure_evidence.sh so validation can run off-VM (e.g. on Mac with az login).

Usage:
  python TRUST_CODEX/tools/validate_azure_entra.py [--artifact-dir evidence/runs/<RunId>/raw/azure] [--out-dir evidence/runs/<RunId>/raw/CUI-Validation-AzureEntra-<RunId>]
  python TRUST_CODEX/tools/validate_azure_entra.py --fail-on-fail   # exit 1 when any check fails (default: exit 0 always)

Exit code: 0 unless --fail-on-fail is used and there are one or more failed checks, in which case 1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

VALIDATOR_NAME = "validate_azure_entra"
VALIDATOR_VERSION = "1.3.0"

CONTROL_TO_LAYER = {
    "AC.L2-3.1.14": "Access Control",
    "IA.L2-3.5.3": "Identity/MFA",
    "IA.L2-3.5.4": "Identity/AuthN",
    "IA.L2-3.5.5": "Identity/AuthN",
    "IA.L2-3.5.6": "Identity/Role-Governance",
    "IA.L2-3.5.7": "Identity/AuthN",
    "SC.L2-3.13.5": "Network/Boundary",
    "SC.L2-3.13.10": "Crypto/Key-Mgmt",
}

CONTROL_TO_RESPONSIBILITY = {
    "AC.L2-3.1.14": "shared",
    "IA.L2-3.5.3": "shared",
    "IA.L2-3.5.4": "shared",
    "IA.L2-3.5.5": "shared",
    "IA.L2-3.5.6": "shared",
    "IA.L2-3.5.7": "shared",
    "SC.L2-3.13.5": "customer",
    "SC.L2-3.13.10": "shared",
}

CONTROLS = [
    ("AC.L2-3.1.14", "Remote Access Routing"),
    ("IA.L2-3.5.3", "MFA for privileged accounts"),
    ("IA.L2-3.5.4", "Replay-resistant authentication"),
    ("IA.L2-3.5.5", "Prevent identifier reuse"),
    ("IA.L2-3.5.6", "Disable identifiers after inactivity"),
    ("MA.L2-3.7.5", "MFA for nonlocal maintenance"),
    ("SC.L2-3.13.10", "Cryptographic key management"),
    ("SC.L2-3.13.5", "Implement subnetworks"),
]


def _basename(path):
    import os
    return os.path.basename(str(path))


def _glob_basenames(artifact_dir, pattern):
    import glob
    import os
    paths = glob.glob(os.path.join(str(artifact_dir), pattern))
    return sorted([os.path.basename(p) for p in paths])


def _validator_sha256() -> str:
    p = Path(__file__).resolve()
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _build_inputs_manifest(artifact_dir: Path) -> list[dict]:
    """Build list of files actually used (exist under artifact_dir) with sha256, size, mtime_utc."""
    inputs_list: list[dict] = []
    seen: set[str] = set()
    candidates: list[Path] = []
    for name in (
        "entra-signin.json",
        "conditional-access-policies.json",
        "role-assignments-all.json",
        "keyvault-list.json",
        "nsg-list.json",
        "mfa-in-path-attested.txt",
        "mfa-in-path-attested.sig",
        "bastion-only-attested.txt",
        "jit-enabled-attested.txt",
        "firewall-enforcement-attested.txt",
        "network-bypass-attested.json",
        "bastion-entra-mfa-attested.txt",
    ):
        candidates.append(artifact_dir / name)
    for g in ("keyvault-*-access-policies.json", "keyvault-*-properties.json", "keyvault-*-role-assignments.json", "nsg-rules-*.json"):
        candidates.extend(artifact_dir.glob(g))
    for p in candidates:
        if not p.is_file() or p.name in seen:
            continue
        seen.add(p.name)
        try:
            raw = p.read_bytes()
            mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
            inputs_list.append({
                "filename": p.name,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "size": len(raw),
                "mtime_utc": mtime,
            })
        except Exception:
            pass
    return inputs_list


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate Azure/Entra 7 controls from artifact dir")
    ap.add_argument("--artifact-dir", default="", help="Dir with role-assignments-all.json, entra-signin.json, keyvault-list.json, nsg-list.json, etc.")
    ap.add_argument("--out-dir", default="", help="Dir for validation-report-azure-entra.txt/json; default: artifact_dir/../CUI-Validation-AzureEntra-<RunId>")
    ap.add_argument("--fail-on-fail", action="store_true", help="Exit 1 when any check fails; default is exit 0 always so runbooks continue")
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

    # ---- MFA-in-path: evidence (CA + sign-in) or attestation fallback ----
    signin = read_json("entra-signin.json")
    has_signin = isinstance(signin, list) and len(signin) > 0
    mfa_policy = any((artifact_dir / n).exists() for n in ("conditional-access-policies.json", "mfa-policy.json", "conditional-access-export.json"))
    has_mfa_policy = mfa_policy

    mfa_in_path_file = artifact_dir / "mfa-in-path-attested.txt"
    mfa_in_path_sig_file = artifact_dir / "mfa-in-path-attested.sig"
    mfa_in_path_attested_present = mfa_in_path_file.exists() and bool(mfa_in_path_file.read_text(encoding="utf-8").strip())
    # Attestation counts as satisfied only when signed: .sig must exist, be non-empty, and contain SIGNED_AT=
    sig_content = mfa_in_path_sig_file.read_text(encoding="utf-8").strip() if mfa_in_path_sig_file.exists() else ""
    mfa_in_path_attested_signed = mfa_in_path_attested_present and bool(sig_content) and ("SIGNED_AT=" in sig_content.upper())

    ca_mfa_for_broad = False
    cap = read_json("conditional-access-policies.json")
    if isinstance(cap, dict) and isinstance(cap.get("value"), list):
        for policy in cap["value"]:
            grant = policy.get("grantControls") or {}
            built_in = grant.get("builtInControls") or []
            if "mfa" in (b.lower() for b in built_in):
                cond = policy.get("conditions") or {}
                apps = cond.get("applications") or {}
                include = apps.get("includeApplications") or []
                if not include or "All" in include or any("Microsoft Azure" in str(a) or "Office 365" in str(a) for a in include):
                    ca_mfa_for_broad = True
                    break

    signin_mfa = False
    if isinstance(signin, list):
        for s in signin:
            if not isinstance(s, dict):
                continue
            req = (s.get("authenticationRequirement") or s.get("conditionalAccessStatus") or "").lower()
            if "mfa" in req or "multiFactorAuthentication" in req:
                signin_mfa = True
                break
            mfa_detail = s.get("mfaDetail") or s.get("authenticationDetails")
            if mfa_detail:
                signin_mfa = True
                break

    bastion_entra_attested = (artifact_dir / "bastion-entra-mfa-attested.txt").exists() and bool((artifact_dir / "bastion-entra-mfa-attested.txt").read_text(encoding="utf-8").strip())
    mfa_in_path_evidence = (ca_mfa_for_broad and signin_mfa) or bastion_entra_attested
    # Attestation path requires signed attestation; written-but-unsigned does not satisfy the five controls
    mfa_in_path_satisfied = mfa_in_path_evidence or mfa_in_path_attested_signed
    if mfa_in_path_evidence and mfa_in_path_attested_signed:
        mfa_in_path_source = "both"
        mfa_in_path_detail = "CA policy(s) and/or sign-in MFA evidence; mfa-in-path-attested.txt + .sig present"
    elif mfa_in_path_evidence:
        mfa_in_path_source = "evidence"
        mfa_in_path_detail = "CA policy(s) require MFA and/or sign-in log shows MFA; or Bastion+Entra MFA attested"
    elif mfa_in_path_attested_signed:
        mfa_in_path_source = "attestation_signed"
        mfa_in_path_detail = "mfa-in-path-attested.txt + mfa-in-path-attested.sig (signed MFA in path)"
    elif mfa_in_path_attested_present:
        mfa_in_path_source = "attestation_unsigned"
        mfa_in_path_detail = "mfa-in-path-attested.txt present but mfa-in-path-attested.sig missing or invalid; sign attestation for pass"
    else:
        mfa_in_path_source = "none"
        mfa_in_path_detail = ""

    # ---- Checks ----
    checks = []

    mfa_evidence_ok = has_signin or has_mfa_policy
    _mfa_evidence_files = sorted(["bastion-entra-mfa-attested.txt", "conditional-access-policies.json", "entra-signin.json", "mfa-in-path-attested.sig", "mfa-in-path-attested.txt"])
    _check = {
        "id": "ENTRA-MFA",
        "control": "IA.L2-3.5.3",
        "title": "MFA for privileged accounts (Entra evidence)",
        "pass": mfa_evidence_ok and mfa_in_path_satisfied,
        "observed": f"Sign-in/CA evidence={mfa_evidence_ok}; MFA in path satisfied={mfa_in_path_satisfied} (source={mfa_in_path_source})",
        "expected": "entra-signin or CA policy export present AND MFA in enclave access path (evidence or signed mfa-in-path-attested.txt + .sig)",
        "evidence_hint": "Entra sign-in export and Conditional Access policies. For MFA-in-path: signed attestation (mfa-in-path-attested.txt + .sig) or CA/sign-in MFA evidence.",
        "mfa_in_path_source": mfa_in_path_source,
        "mfa_in_path_detail": mfa_in_path_detail or None,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
    _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
    _check["evidence_files_used"] = _mfa_evidence_files
    checks.append(_check)
    _check = {
        "id": "ENTRA-MFA-MA",
        "control": "MA.L2-3.7.5",
        "title": "MFA for nonlocal maintenance (Entra evidence)",
        "pass": mfa_evidence_ok and mfa_in_path_satisfied,
        "observed": f"Sign-in/CA evidence={mfa_evidence_ok}; MFA in path satisfied={mfa_in_path_satisfied} (source={mfa_in_path_source})",
        "expected": "Entra/MFA evidence AND MFA in enclave access path (evidence or attestation)",
        "evidence_hint": "Entra sign-in and MFA policy. For MFA-in-path: signed attestation (mfa-in-path-attested.txt + .sig) or CA/sign-in MFA evidence.",
        "mfa_in_path_source": mfa_in_path_source,
        "mfa_in_path_detail": mfa_in_path_detail or None,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
    _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
    _check["evidence_files_used"] = _mfa_evidence_files
    checks.append(_check)

    entra_evidence = has_signin or has_artifact("role-assignments-all.json")
    _admin_mfa_files = sorted(["bastion-entra-mfa-attested.txt", "conditional-access-policies.json", "entra-admin-roles.json", "entra-signin.json", "mfa-in-path-attested.sig", "mfa-in-path-attested.txt"])
    for cid, title in [("IA.L2-3.5.4", "Replay-resistant authentication"), ("IA.L2-3.5.5", "Prevent identifier reuse"), ("IA.L2-3.5.6", "Disable identifiers after inactivity")]:
        eid = "ENTRA-REPLAY" if cid == "IA.L2-3.5.4" else "ENTRA-NO-REUSE" if cid == "IA.L2-3.5.5" else "ENTRA-INACTIVITY"
        _check = {
            "id": eid,
            "control": cid,
            "title": title + " (Entra evidence)",
            "pass": entra_evidence and mfa_in_path_satisfied,
            "observed": f"Entra/role evidence={entra_evidence}; MFA in path satisfied={mfa_in_path_satisfied} (source={mfa_in_path_source})",
            "expected": "Entra/role evidence AND MFA in enclave access path (evidence or attestation)",
            "evidence_hint": "Entra sign-in and role-assignments (or admin roles). For MFA-in-path: signed attestation (mfa-in-path-attested.txt + .sig) or CA/sign-in MFA evidence.",
            "mfa_in_path_source": mfa_in_path_source,
            "mfa_in_path_detail": mfa_in_path_detail or None,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }
        _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
        _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
        _check["evidence_files_used"] = _admin_mfa_files
        checks.append(_check)

    # SC.L2-3.13.10 — presence + soft delete, purge protection, RBAC from keyvault-*-properties.json when present
    kv_list = read_json("keyvault-list.json")
    has_kv = isinstance(kv_list, list) and len(kv_list) > 0
    keyvault_details: list[dict] = []
    kv_pass = has_kv
    if has_kv and isinstance(kv_list, list):
        for v in kv_list:
            if not isinstance(v, dict):
                continue
            name = v.get("name") or ""
            safe = "".join(c for c in name if c.isalnum() or c in "_-")
            detail: dict = {"vault_name": name, "soft_delete_enabled": None, "purge_protection_enabled": None, "rbac_or_access_policy": None}
            props_path = artifact_dir / f"keyvault-{safe}-properties.json"
            if props_path.is_file():
                try:
                    props_data = json.loads(props_path.read_text(encoding="utf-8"))
                    propts = (props_data or {}).get("properties") or {}
                    detail["soft_delete_enabled"] = propts.get("enableSoftDelete")
                    detail["purge_protection_enabled"] = propts.get("enablePurgeProtection")
                    rbac = propts.get("enableRbacAuthorization")
                    has_ap = (artifact_dir / f"keyvault-{safe}-access-policies.json").is_file()
                    has_ra = (artifact_dir / f"keyvault-{safe}-role-assignments.json").is_file()
                    if rbac is True and (has_ap or has_ra):
                        detail["rbac_or_access_policy"] = "RBAC and access policies documented"
                    elif rbac is True:
                        detail["rbac_or_access_policy"] = "RBAC"
                    elif has_ap or has_ra:
                        detail["rbac_or_access_policy"] = "Access policies"
                    else:
                        detail["rbac_or_access_policy"] = "unknown"
                except Exception:
                    detail["rbac_or_access_policy"] = "properties not parseable"
            else:
                detail["rbac_or_access_policy"] = "properties not exported"
            keyvault_details.append(detail)
            if detail["soft_delete_enabled"] is False:
                kv_pass = False
            if detail["purge_protection_enabled"] is False:
                kv_pass = False
    if not has_kv:
        kv_pass = False
    _kv_evidence = sorted(
        ["keyvault-list.json"]
        + _glob_basenames(artifact_dir, "keyvault-*-properties.json")
        + _glob_basenames(artifact_dir, "keyvault-*-access-policies.json")
        + _glob_basenames(artifact_dir, "keyvault-*-role-assignments.json")
    )
    _check = {
        "id": "AZ-KEYVAULT",
        "control": "SC.L2-3.13.10",
        "title": "Cryptographic key management (Azure Key Vault evidence)",
        "pass": kv_pass,
        "observed": f"keyvault-list present and non-empty={has_kv}; keyvault_details={len(keyvault_details)} vault(s); all soft delete and purge protection={kv_pass}" if keyvault_details else f"keyvault-list.json present and non-empty={has_kv}",
        "expected": "Azure Key Vault list; when keyvault-*-properties.json exported: soft delete and purge protection enabled per vault",
        "evidence_hint": "keyvault-list.json; for each vault optionally keyvault-*-properties.json (soft delete, purge protection), keyvault-*-access-policies.json, keyvault-*-role-assignments.json.",
        "keyvault_details": keyvault_details if keyvault_details else None,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
    _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
    _check["evidence_files_used"] = _kv_evidence
    checks.append(_check)

    # SC.L2-3.13.5: NSG present; RDP (3389) not effectively allowed from public (all nsg-rules-*.json; port/source arrays); acceptable alternatives
    has_nsg = has_artifact("nsg-list.json")
    rdp_open_public = False
    if has_nsg:
        for f in sorted(artifact_dir.glob("nsg-rules-*.json")):
            try:
                rules = json.loads(f.read_text(encoding="utf-8"))
                if not isinstance(rules, list):
                    continue
                rdp_rules = []
                for r in rules:
                    direction = str(r.get("direction") or "").lower()
                    if direction != "inbound":
                        continue
                    port_range = r.get("destinationPortRange")
                    port_ranges = list(r.get("destinationPortRanges") or [])
                    if port_range is not None and str(port_range).strip():
                        if not port_ranges:
                            port_ranges = [str(port_range)]
                    matches_3389 = any("3389" in str(p) or str(p).strip() in ("*", "Any") for p in port_ranges) if port_ranges else False
                    if not matches_3389:
                        continue
                    src = r.get("sourceAddressPrefix")
                    src_list = list(r.get("sourceAddressPrefixes") or [])
                    if src is not None:
                        src_list = [src] + src_list if src_list else [src]
                    if not isinstance(src_list, list):
                        src_list = [str(src_list)] if src_list else []
                    public_any = any(
                        str(s) in ("*", "0.0.0.0/0", "Internet", "Any") or "*" in str(s)
                        for s in src_list
                    )
                    if not public_any:
                        continue
                    rdp_rules.append((int(r.get("priority") or 65535), str(r.get("access") or "").lower()))
                rdp_rules.sort(key=lambda x: x[0])
                if rdp_rules and rdp_rules[0][1] == "allow":
                    rdp_open_public = True
                    break
            except Exception:
                pass
    acceptable_alternative: str | None = None
    rationale = ""
    if rdp_open_public:
        if (artifact_dir / "bastion-only-attested.txt").is_file() and (artifact_dir / "bastion-only-attested.txt").read_text(encoding="utf-8").strip():
            acceptable_alternative = "bastion_only"
            rationale = "Shared/Customer: RDP only via Azure Bastion (attested)."
        elif (artifact_dir / "jit-enabled-attested.txt").is_file() and (artifact_dir / "jit-enabled-attested.txt").read_text(encoding="utf-8").strip():
            acceptable_alternative = "jit_enabled"
            rationale = "Shared/Customer: JIT enabled for VM access (attested)."
        elif (artifact_dir / "firewall-enforcement-attested.txt").is_file() and (artifact_dir / "firewall-enforcement-attested.txt").read_text(encoding="utf-8").strip():
            acceptable_alternative = "firewall_enforcement"
            rationale = "Shared/Customer: Azure Firewall (or equivalent) enforces access (attested)."
        else:
            nb = read_json("network-bypass-attested.json")
            if isinstance(nb, dict):
                if nb.get("bastion_only"):
                    acceptable_alternative = "bastion_only"
                    rationale = "Shared/Customer: RDP only via Azure Bastion (attested)."
                elif nb.get("jit_enabled"):
                    acceptable_alternative = "jit_enabled"
                    rationale = "Shared/Customer: JIT enabled for VM access (attested)."
                elif nb.get("firewall_enforcement"):
                    acceptable_alternative = "firewall_enforcement"
                    rationale = "Shared/Customer: Azure Firewall (or equivalent) enforces access (attested)."
    nsg_pass = has_nsg and (not rdp_open_public or acceptable_alternative is not None)
    _nsg_evidence = sorted(
        _glob_basenames(artifact_dir, "nsg-rules-*.json")
        + ["bastion-only-attested.txt", "firewall-enforcement-attested.txt", "jit-enabled-attested.txt", "network-bypass-attested.json"]
    )
    _check = {
        "id": "AZ-NSG",
        "control": "SC.L2-3.13.5",
        "title": "Implement subnetworks (NSG evidence)",
        "pass": nsg_pass,
        "observed": f"NSG list present={has_nsg}; effective RDP from public={rdp_open_public}; acceptable_alternative={acceptable_alternative or 'none'}",
        "expected": "NSG list/rules present; RDP (3389) not allowed from public, or acceptable alternative (Bastion/JIT/Firewall) attested",
        "evidence_hint": "nsg-list.json and nsg-rules-*.json. If RDP is open to public, add one of: bastion-only-attested.txt, jit-enabled-attested.txt, firewall-enforcement-attested.txt, or network-bypass-attested.json.",
        "effective_rdp_public": rdp_open_public,
        "acceptable_alternative": acceptable_alternative,
        "rationale": rationale or None,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
    _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
    _check["evidence_files_used"] = _nsg_evidence
    checks.append(_check)

    # AC.L2-3.1.14 — Remote Access Routing: managed access control points identified and remote access routed through them.
    # Pass when NSG restricts RDP from public (or attested alternative) AND Entra sign-in or role evidence present (managed access path).
    remote_access_pass = nsg_pass and (has_signin or entra_evidence)
    _ra_evidence = sorted(set(
        _nsg_evidence + ["entra-signin.json", "role-assignments-all.json", "conditional-access-policies.json"]
    ))
    _check = {
        "id": "AC-REMOTE-ACCESS",
        "control": "AC.L2-3.1.14",
        "title": "Remote Access Routing (managed access control points)",
        "pass": remote_access_pass,
        "observed": f"NSG restricts public RDP={nsg_pass}; Entra/sign-in or role evidence={has_signin or entra_evidence} → remote access routed through managed points",
        "expected": "NSG list/rules with RDP not from public (or attested alternative); Entra sign-in or role evidence for managed access path.",
        "evidence_hint": "nsg-list.json, nsg-rules-*.json; entra-signin.json or role-assignments-all.json (and optionally conditional-access-policies.json) to show managed access path.",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
    _check["layer"] = CONTROL_TO_LAYER.get(_check["control"], None)
    _check["provider_or_customer"] = CONTROL_TO_RESPONSIBILITY.get(_check["control"], "shared")
    _check["evidence_files_used"] = _ra_evidence
    checks.append(_check)

    # Partial = technical config (CA/sign-in/roles) present from Azure/Entra but MFA in path not confirmed from that config; awaiting attestation sign-off (Governance > Evidence)
    for c in checks:
        if c["pass"]:
            c["status"] = "pass"
            c["partial"] = False
            c["partial_reason"] = None
        elif c["id"] in ("ENTRA-MFA", "ENTRA-MFA-MA"):
            # Have sign-in or CA policy (technical config) but MFA in path not satisfied
            if mfa_evidence_ok and not mfa_in_path_satisfied:
                c["status"] = "partial"
                c["partial"] = True
                c["partial_reason"] = "Awaiting attestation sign-off (Governance > Evidence)"
            else:
                c["status"] = "fail"
                c["partial"] = False
                c["partial_reason"] = None
        elif c["id"] in ("ENTRA-REPLAY", "ENTRA-NO-REUSE", "ENTRA-INACTIVITY"):
            # Have sign-in or role assignments (technical config) but MFA in path not satisfied
            if entra_evidence and not mfa_in_path_satisfied:
                c["status"] = "partial"
                c["partial"] = True
                c["partial_reason"] = "Awaiting attestation sign-off (Governance > Evidence)"
            else:
                c["status"] = "fail"
                c["partial"] = False
                c["partial_reason"] = None
        else:
            c["status"] = "fail"
            c["partial"] = False
            c["partial_reason"] = None

    pass_count = sum(1 for c in checks if c["pass"])
    partial_count = sum(1 for c in checks if c.get("partial"))
    fail_count = len(checks) - pass_count - partial_count
    generated = datetime.now(timezone.utc).isoformat()

    summary = {
        "generated_utc": generated,
        "run_id": run_id,
        "computer": os.environ.get("COMPUTERNAME", os.uname().nodename if hasattr(os, "uname") else "unknown"),
        "user": os.environ.get("USER", os.environ.get("USERNAME", "unknown")),
        "azure_entra_dir": str(artifact_dir),
        "pass_count": pass_count,
        "partial_count": partial_count,
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
        "AND MFA in enclave access path (evidence from CA+sign-in or signed mfa-in-path-attested.txt + .sig).",
        "PARTIAL = Azure/Entra technical config (CA policy, sign-in, or role assignments) present but MFA in path not confirmed; awaiting attestation sign-off (Governance > Evidence).",
        "Exit code: 0 unless --fail-on-fail is used and there are failures, in which case exit 1.",
        f"Computer: {summary['computer']}",
        f"User: {summary['user']}",
        f"Azure/Entra artifact dir: {summary['azure_entra_dir']}",
        f"PASS: {pass_count}  PARTIAL: {partial_count}  FAIL: {fail_count}  TOTAL: {len(checks)}",
        "",
        "Checks:",
    ]
    for c in checks:
        status_label = c["status"].upper()
        part_note = f" | {c['partial_reason']}" if c.get("partial_reason") else ""
        lines.append(f"[{status_label}] {c['title']} ({c['control']}) - {c['id']} | Observed: {c['observed']} | Expected: {c['expected']} | Evidence: {c['evidence_hint']}{part_note}")
    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # .json — include validator identity, inputs manifest, adjudication metadata, and report integrity hash
    validator_block = {"name": VALIDATOR_NAME, "version": VALIDATOR_VERSION, "sha256": _validator_sha256()}
    inputs_manifest = _build_inputs_manifest(artifact_dir)
    payload = {
        "run_id": run_id,
        "generated_utc": generated,
        "report_sha256": None,  # filled after canonical serialization
        "validator": validator_block,
        "inputs": inputs_manifest,
        "summary": summary,
        "checks": checks,
        "azure_entra_dir": str(artifact_dir),
    }
    # Report integrity: SHA-256 of canonical JSON with report_sha256 set to null (for verification)
    canonical_bytes = json.dumps(payload, sort_keys=True, indent=2).encode("utf-8")
    payload["report_sha256"] = hashlib.sha256(canonical_bytes).hexdigest()
    json_path = out_dir / "validation-report-azure-entra.json"
    json_path.write_text(json.dumps(payload, sort_keys=True, indent=2), encoding="utf-8")

    print(f"Wrote: {txt_path}")
    print(f"Wrote: {json_path}")
    print(f"PASS: {pass_count}  PARTIAL: {partial_count}  FAIL: {fail_count}  TOTAL: {len(checks)}")
    if args.fail_on_fail and fail_count > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
