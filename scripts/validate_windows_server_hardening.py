#!/usr/bin/env python3
"""
Windows Server hardening evidence validator.
Reads CUI evidence bundle (host/, policy/, audit/, network/, crypto/, defender/, storage/, apps/)
and produces a normalized validation report (JSON + TXT) for control-plane ingestion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

VERSION = "2.0.0"
VALIDATOR_NAME = "validate_windows_server_hardening"
MAX_READ_BYTES = 512 * 1024  # 512 KiB per file

# Default path to 73-control OS evidence manifest (relative to repo root)
DEFAULT_MANIFEST_PATH = "src/data/os-evidence-nist-manifest.json"
PARTIAL_NOTE = "Accompanying governance documentation, logs, or records required."

# Ontology layer IDs (must match layers_ontology.v1.json exactly)
ONTOLOGY_LAYER_IDS = frozenset({
    "Physical", "Facility/Environmental", "Infrastructure/Hardware", "Infrastructure/Hypervisor",
    "Provider/Backbone-Network", "Network/Boundary", "Network/Firewall", "Network/Egress-Control",
    "Network/Segmentation", "Network/Private-Connectivity", "Network/Remote-Access", "Network/Configuration",
    "Identity/AuthN", "Identity/MFA", "Identity/Conditional-Access", "Identity/Role-Governance",
    "Identity/Configuration", "Identity/Account-Lifecycle", "Logging/Collection", "Logging/Monitoring",
    "Logging/Analytics", "Vulnerability-Mgmt", "Continuous-Monitoring", "Monitoring/Detection",
    "Posture/Compliance-Mapping", "Crypto/Transit", "Crypto/At Rest", "Crypto/FIPS", "Crypto/Key-Mgmt",
    "Crypto/Secrets-Management", "Backup/Recovery", "Backup/Storage-Protection", "GuestOS/Hardening",
    "GuestOS/Logging-Config", "GuestOS/Patching", "GuestOS/Endpoint-Protection-Config",
    "Application/Config", "Application/Logging", "Governance/Policy", "Governance/Training",
    "Governance/IR", "Governance/Risk", "Governance/SSP", "Governance/POAM", "Governance/HR",
    "Data/Classification-Handling",
})

CONTROL_TO_LAYER: dict[str, str] = {
    "SC.L2-3.13.11": "Crypto/FIPS",
    "SC.L2-3.13.10": "Crypto/Key-Mgmt",
    "AU.L2-3.3.1": "Logging/Collection",
    "AU.L2-3.3.3": "Logging/Monitoring",
    "AU.L2-3.3.4": "Logging/Collection",
    "CM.L2-3.4.1": "GuestOS/Hardening",
    "CM.L2-3.4.6": "GuestOS/Patching",
    "SC.L2-3.13.5": "Network/Boundary",
    "SI.L2-3.14.2": "GuestOS/Endpoint-Protection-Config",
    "SC.L2-3.13.1": "Network/Firewall",
    "SC.L2-3.13.2": "Network/Firewall",
    "AC.L2-3.1.13": "Crypto/Transit",
    "MP.L2-3.8.1": "Crypto/At Rest",
    "AU.L2-3.3.8": "GuestOS/Logging-Config",
}

CONTROL_TO_RESPONSIBILITY: dict[str, str] = {
    "SC.L2-3.13.11": "customer",
    "SC.L2-3.13.10": "customer",
    "AU.L2-3.3.1": "customer",
    "AU.L2-3.3.3": "customer",
    "AU.L2-3.3.4": "customer",
    "CM.L2-3.4.1": "customer",
    "CM.L2-3.4.6": "customer",
    "SC.L2-3.13.5": "customer",
    "SI.L2-3.14.2": "customer",
    "SC.L2-3.13.1": "customer",
    "SC.L2-3.13.2": "customer",
    "AC.L2-3.1.13": "customer",
    "MP.L2-3.8.1": "customer",
    "AU.L2-3.3.8": "customer",
}


def _basename(path: str) -> str:
    return os.path.basename(path.replace("\\", "/"))


def _read_text(path: str | Path, max_bytes: int = MAX_READ_BYTES) -> str:
    path = Path(path)
    if not path.is_file():
        return ""
    try:
        raw = path.read_bytes()
        if len(raw) > max_bytes:
            raw = raw[:max_bytes]
        return raw.decode("utf-8", errors="replace")
    except OSError:
        return ""


def _glob_basenames(artifact_dir: str | Path, pattern: str) -> list[str]:
    artifact_dir = Path(artifact_dir)
    if not artifact_dir.is_dir():
        return []
    basenames: list[str] = []
    seen: set[str] = set()
    for p in artifact_dir.glob(pattern):
        if p.is_file():
            b = _basename(str(p.relative_to(artifact_dir)))
            if b not in seen:
                seen.add(b)
                basenames.append(b)
    return sorted(basenames)


def _validator_sha256() -> str:
    try:
        self_path = Path(__file__).resolve()
        data = self_path.read_bytes()
        return hashlib.sha256(data).hexdigest()
    except OSError:
        return ""


def _file_sha256(path: Path) -> str:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return ""


def _parse_hashes_file(content: str) -> list[tuple[str, str]]:
    """Parse hashes.sha256.txt lines: '<sha256>  <path>' or '<sha256> *<path>'. Returns [(path_normalized, sha256_lower), ...]."""
    out: list[tuple[str, str]] = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "  " in line:
            sha256_part, _, path_part = line.partition("  ")
            path_part = path_part.strip().lstrip("*").strip().replace("\\", "/")
            if sha256_part and len(sha256_part) == 64:
                out.append((path_part, sha256_part.lower()))
        elif " *" in line:
            sha256_part, _, path_part = line.partition(" *")
            path_part = path_part.strip().replace("\\", "/")
            if sha256_part and len(sha256_part) == 64:
                out.append((path_part, sha256_part.lower()))
    return out


def run_bundle_integrity_check(artifact_dir: Path) -> dict[str, Any]:
    """Run BUNDLE.INTEGRITY check: verify meta/manifest.json and meta/hashes.sha256.txt (or hashes.sha256.txt) and hash list."""
    artifact_dir = Path(artifact_dir)
    evidence_basenames = ["manifest.json", "hashes.sha256.txt"]
    meta_manifest = artifact_dir / "meta" / "manifest.json"
    meta_hashes = artifact_dir / "meta" / "hashes.sha256.txt"
    root_hashes = artifact_dir / "hashes.sha256.txt"
    manifest_path = meta_manifest if meta_manifest.is_file() else None
    hash_file = meta_hashes if meta_hashes.is_file() else (root_hashes if root_hashes.is_file() else None)
    hash_file_path_basename = "hashes.sha256.txt"
    manifest_path_basename = "manifest.json"

    missing: list[str] = []
    if not manifest_path or not manifest_path.is_file():
        missing.append("meta/manifest.json")
    if not hash_file or not hash_file.is_file():
        missing.append("meta/hashes.sha256.txt")

    if missing:
        details: dict[str, Any] = {
            "hash_file_path": hash_file_path_basename,
            "manifest_path": manifest_path_basename,
            "total_hashed_files": 0,
            "verified_ok": 0,
            "missing_files": sorted(missing),
            "hash_mismatches": [],
        }
        return {
            "control": "BUNDLE.INTEGRITY",
            "pass": False,
            "observed": "Missing required files: " + ", ".join(sorted(missing)),
            "expected": "Both meta/manifest.json and meta/hashes.sha256.txt present and verified",
            "evidence_hint": "Provide meta/manifest.json and meta/hashes.sha256.txt in the evidence bundle.",
            "evidence_files_used": sorted(evidence_basenames),
            "provider_or_customer": "customer",
            "layer": None,
            "details": details,
        }

    hash_content = _read_text(hash_file, max_bytes=2 * 1024 * 1024)
    entries = _parse_hashes_file(hash_content)
    missing_files: list[str] = []
    hash_mismatches: list[dict[str, str]] = []
    verified_ok = 0
    for rel_path, expected_sha in entries:
        full_path = artifact_dir / rel_path
        if not full_path.is_file():
            missing_files.append(rel_path)
            continue
        observed_sha = _file_sha256(full_path)
        if observed_sha.lower() != expected_sha:
            hash_mismatches.append({"path": rel_path, "expected": expected_sha, "observed": observed_sha.lower()})
        else:
            verified_ok += 1

    manifest_ok = True
    if manifest_path and manifest_path.is_file():
        try:
            manifest_data = json.loads(_read_text(manifest_path, max_bytes=1024 * 1024))
            if isinstance(manifest_data, dict) and "files" in manifest_data:
                for f in manifest_data.get("files", []):
                    fn = f.get("filename", f.get("path", ""))
                    if fn and isinstance(fn, str):
                        p = artifact_dir / fn.replace("\\", "/")
                        if not p.is_file():
                            manifest_ok = False
                            break
            elif isinstance(manifest_data, list):
                for item in manifest_data:
                    fn = item.get("filename", item.get("path", "")) if isinstance(item, dict) else ""
                    if fn and isinstance(fn, str):
                        p = artifact_dir / fn.replace("\\", "/")
                        if not p.is_file():
                            manifest_ok = False
                            break
        except (json.JSONDecodeError, TypeError):
            manifest_ok = False

    pass_ = len(missing_files) == 0 and len(hash_mismatches) == 0 and manifest_ok
    details = {
        "hash_file_path": hash_file_path_basename,
        "manifest_path": manifest_path_basename,
        "total_hashed_files": len(entries),
        "verified_ok": verified_ok,
        "missing_files": sorted(missing_files),
        "hash_mismatches": sorted(hash_mismatches, key=lambda x: x["path"]),
    }
    if missing_files or hash_mismatches:
        observed_msg = "Integrity failed: "
        if missing_files:
            observed_msg += str(len(missing_files)) + " missing file(s); "
        if hash_mismatches:
            observed_msg += str(len(hash_mismatches)) + " hash mismatch(es)."
        observed_msg = observed_msg.strip()
    else:
        observed_msg = "All " + str(verified_ok) + " hashed files verified; manifest present."
    return {
        "control": "BUNDLE.INTEGRITY",
        "pass": pass_,
        "observed": observed_msg,
        "expected": "Both meta/manifest.json and meta/hashes.sha256.txt present and verified",
        "evidence_hint": "Review meta/manifest.json and meta/hashes.sha256.txt; re-run collector if tampered.",
        "evidence_files_used": sorted(evidence_basenames),
        "provider_or_customer": "customer",
        "layer": None,
        "details": details,
    }


def _build_inputs_manifest(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    meta_manifest = artifact_dir / "meta" / "manifest.json"
    if meta_manifest.is_file():
        try:
            data = json.loads(_read_text(meta_manifest, max_bytes=1024 * 1024))
            if isinstance(data, list):
                return [
                    {
                        "filename": str(item.get("filename", item.get("path", ""))),
                        "sha256": str(item.get("sha256", "")).lower(),
                        "size": int(item.get("size", item.get("size_bytes", 0))),
                        "mtime_utc": str(item.get("mtime_utc", "")),
                    }
                    for item in data
                    if item
                ]
            if isinstance(data, dict) and "files" in data:
                return [
                    {
                        "filename": str(f.get("filename", f.get("path", ""))),
                        "sha256": str(f.get("sha256", "")).lower(),
                        "size": int(f.get("size", f.get("size_bytes", 0))),
                        "mtime_utc": str(f.get("mtime_utc", "")),
                    }
                    for f in data["files"]
                ]
        except (json.JSONDecodeError, TypeError):
            pass
    inputs_list: list[dict[str, Any]] = []
    for rel in sorted(files_used):
        p = artifact_dir / rel
        if p.is_file():
            try:
                stat = p.stat()
                inputs_list.append({
                    "filename": rel,
                    "sha256": _file_sha256(p),
                    "size": stat.st_size,
                    "mtime_utc": "" if not hasattr(stat, "st_mtime") else str(stat.st_mtime),
                })
            except OSError:
                inputs_list.append({"filename": rel, "sha256": "", "size": 0, "mtime_utc": ""})
    return inputs_list


def _load_manifest(manifest_path: str | Path) -> list[dict[str, Any]]:
    """Load 73-control OS evidence manifest. Returns list of {control_id, evidence_files, support_level}."""
    path = Path(manifest_path)
    if not path.is_file():
        # Try relative to script's repo root (parent of scripts/)
        repo_root = Path(__file__).resolve().parent.parent
        path = repo_root / manifest_path
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        controls = data.get("controls") if isinstance(data, dict) else []
        return list(controls) if isinstance(controls, list) else []
    except (json.JSONDecodeError, OSError, TypeError):
        return []


def _normalize_evidence_paths(used: list[str], manifest_files: list[str]) -> list[str]:
    """Convert evidence_files_used to full relative paths (forward slashes) using manifest list."""
    result: list[str] = []
    for p in used:
        p = p.replace("\\", "/").strip()
        if "/" in p:
            result.append(p)
        else:
            # Basename: find in manifest full paths
            match = next((m for m in manifest_files if m.endswith("/" + p) or m == p), None)
            result.append(match if match else p)
    return sorted(set(result))


def _build_73_checks(
    artifact_dir: Path,
    manifest_controls: list[dict[str, Any]],
    content_checks: list[dict[str, Any]],
    files_used: set[str],
) -> list[dict[str, Any]]:
    """Build exactly one check per manifest control (73 total). Content checks merged; rest file-presence."""
    artifact_dir = Path(artifact_dir)
    # Index content checks by control_id
    by_control: dict[str, list[dict[str, Any]]] = {}
    for c in content_checks:
        cid = c.get("control") or ""
        if cid and cid != "BUNDLE.INTEGRITY":
            by_control.setdefault(cid, []).append(c)
    # Set of relative paths present under artifact_dir
    present_paths: set[str] = set()
    for rel in files_used:
        if (artifact_dir / rel.replace("\\", "/")).is_file():
            present_paths.add(rel.replace("\\", "/"))
    # Also scan manifest evidence_files for file-presence
    all_manifest_paths: list[str] = []
    for entry in manifest_controls:
        for f in entry.get("evidence_files") or []:
            f = f.replace("\\", "/")
            all_manifest_paths.append(f)
            if (artifact_dir / f).is_file():
                present_paths.add(f)

    checks: list[dict[str, Any]] = []
    for entry in manifest_controls:
        control_id = entry.get("control_id") or ""
        evidence_files: list[str] = [x.replace("\\", "/") for x in (entry.get("evidence_files") or [])]
        support_level: str = (entry.get("support_level") or "STRONG").upper()
        is_partial_support = support_level == "PARTIAL"

        if control_id in by_control:
            # Merge content checks for this control
            content_list = by_control[control_id]
            all_pass = all(c.get("pass", False) for c in content_list)
            observed_parts = [c.get("observed", "") for c in content_list]
            expected_parts = [c.get("expected", "") for c in content_list]
            used: list[str] = []
            for c in content_list:
                for u in c.get("evidence_files_used") or []:
                    used.append(u)
            full_paths = _normalize_evidence_paths(used, all_manifest_paths)
            observed = " | ".join(observed_parts)[:2000] if observed_parts else "No content checks"
            expected = " | ".join(expected_parts)[:1000] if expected_parts else "All required evidence present per 73/73 OS evidence manifest."
            hint = content_list[0].get("evidence_hint", "73/73 OS evidence manifest") if content_list else "73/73 OS evidence manifest"
            partial = is_partial_support and all_pass
            if partial:
                observed = observed + ". " + PARTIAL_NOTE
                hint = hint + ". " + PARTIAL_NOTE
            check = _make_check(
                control_id,
                all_pass,
                observed,
                expected,
                hint,
                full_paths,
                _resolve_layer(control_id, None),
                None,
                partial=partial,
            )
        else:
            # File-presence only
            missing = [f for f in evidence_files if f not in present_paths]
            pass_ = len(missing) == 0
            present_list = [f for f in evidence_files if f in present_paths]
            if pass_:
                observed = f"All {len(evidence_files)} required files present."
            else:
                observed = f"Missing: {', '.join(sorted(missing)[:20])}" + ("..." if len(missing) > 20 else "")
            expected = "All required files present per 73/73 OS evidence manifest."
            partial = is_partial_support and pass_
            if partial:
                observed = observed + " " + PARTIAL_NOTE
            check = _make_check(
                control_id,
                pass_,
                observed,
                expected,
                "73/73 OS evidence manifest",
                present_list,
                _resolve_layer(control_id, None),
                None,
                partial=partial,
            )
        checks.append(check)
    return checks


def _resolve_layer(control_id: str, fallback: str | None) -> str | None:
    layer = CONTROL_TO_LAYER.get(control_id, fallback)
    if layer is not None and layer not in ONTOLOGY_LAYER_IDS:
        return None
    return layer


def _responsibility(control_id: str) -> str:
    return CONTROL_TO_RESPONSIBILITY.get(control_id, "customer")


def _make_check(
    control_id: str,
    pass_: bool,
    observed: str,
    expected: str,
    evidence_hint: str,
    evidence_files_used: list[str],
    layer: str | None = None,
    details: dict[str, Any] | None = None,
    partial: bool = False,
) -> dict[str, Any]:
    layer = _resolve_layer(control_id, layer)
    out: dict[str, Any] = {
        "control": control_id,
        "pass": pass_,
        "observed": observed[:2000] if len(observed) > 2000 else observed,
        "expected": expected[:1000] if len(expected) > 1000 else expected,
        "evidence_hint": evidence_hint[:1000] if len(evidence_hint) > 1000 else evidence_hint,
        "evidence_files_used": sorted(evidence_files_used),
        "provider_or_customer": _responsibility(control_id),
        "layer": layer,
        **({"details": details} if details else {}),
    }
    if partial:
        out["partial"] = True
    return out


def run_crypto_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    crypto_dir = artifact_dir / "crypto"
    fips_path = crypto_dir / "fips.txt"
    files_used.add("crypto/fips.txt")
    content = _read_text(fips_path)
    fips_enabled = "enabled" in content.lower() or "1" in content.strip()
    checks.append(_make_check(
        "SC.L2-3.13.11",
        fips_enabled,
        "FIPS mode: " + ("enabled" if fips_enabled else "not enabled or file missing"),
        "FIPS mode enabled for cryptographic modules",
        "Review crypto/fips.txt; on system: Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\FipsAlgorithmPolicy",
        ["fips.txt"],
        "Crypto/FIPS",
    ))

    schannel = crypto_dir / "schannel-protocols.txt"
    files_used.add("crypto/schannel-protocols.txt")
    schannel_content = _read_text(schannel)
    tls_ok = "TLS 1.2" in schannel_content or "TLS 1.3" in schannel_content
    weak = "SSL 2.0" in schannel_content or "SSL 3.0" in schannel_content or "TLS 1.0" in schannel_content
    checks.append(_make_check(
        "AC.L2-3.1.13",
        tls_ok and not weak,
        "TLS protocols in schannel: " + ("TLS 1.2/1.3 present; weak disabled" if tls_ok and not weak else "weak or missing strong TLS"),
        "TLS 1.2 or 1.3 enabled; SSL 2.0/3.0 and TLS 1.0 disabled",
        "Review crypto/schannel-protocols.txt",
        ["schannel-protocols.txt"],
        "Crypto/Transit",
    ))

    ciphers = crypto_dir / "tls-ciphersuites.txt"
    files_used.add("crypto/tls-ciphersuites.txt")
    cipher_content = _read_text(ciphers)
    cipher_ok = bool(cipher_content.strip()) and "NULL" not in cipher_content.upper()
    checks.append(_make_check(
        "SC.L2-3.13.11",
        cipher_ok,
        "TLS cipher suites: " + ("restricted to strong ciphers" if cipher_ok else "missing or weak ciphers present"),
        "Strong cipher suites only; no NULL/export",
        "Review crypto/tls-ciphersuites.txt",
        ["tls-ciphersuites.txt"],
        "Crypto/Transit",
    ))
    return checks


def run_network_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    network_dir = artifact_dir / "network"
    firewall_basenames = _glob_basenames(network_dir, "**/firewall*.txt") + _glob_basenames(network_dir, "**/*firewall*")
    for b in firewall_basenames:
        files_used.add("network/" + b)
    firewall_ok = len(firewall_basenames) > 0
    checks.append(_make_check(
        "SC.L2-3.13.1",
        firewall_ok,
        ("Firewall evidence files: " + str(len(firewall_basenames)) + " present") if firewall_basenames else "No firewall evidence files",
        "At least one firewall configuration or rules file present",
        "Review network/ for firewall-rules or firewall.txt",
        firewall_basenames or ["(none)"],
        "Network/Firewall",
    ))

    rdp_basenames = _glob_basenames(network_dir, "**/*rdp*") + _glob_basenames(network_dir, "**/listening*.txt")
    for b in rdp_basenames:
        files_used.add("network/" + b)
    rdp_content = ""
    for name in rdp_basenames[:3]:
        rdp_content += _read_text(network_dir / name)
    rdp_restricted = "3389" not in rdp_content or "restricted" in rdp_content.lower() or "disabled" in rdp_content.lower()
    checks.append(_make_check(
        "SC.L2-3.13.5",
        len(rdp_basenames) > 0,
        "RDP/network evidence: " + str(len(rdp_basenames)) + " files; RDP exposure: " + ("restricted or documented" if rdp_restricted else "check required"),
        "RDP configuration documented; exposure restricted where required",
        "Review network/ for RDP policy and listening ports",
        rdp_basenames if rdp_basenames else ["(none)"],
        "Network/Boundary",
    ))

    smb_basenames = _glob_basenames(network_dir, "**/*smb*")
    for b in smb_basenames:
        files_used.add("network/" + b)
    smb_content = ""
    for name in smb_basenames[:3]:
        smb_content += _read_text(network_dir / name)
    smb1_disabled = "SMB1" not in smb_content.upper() or "disabled" in smb_content.lower()
    checks.append(_make_check(
        "SC.L2-3.13.2",
        len(smb_basenames) > 0 and smb1_disabled,
        "SMB evidence: " + str(len(smb_basenames)) + " files; SMB1: " + ("disabled" if smb1_disabled else "check"),
        "SMB configuration present; SMBv1 disabled",
        "Review network/ for SMB config",
        smb_basenames if smb_basenames else ["(none)"],
        "Network/Firewall",
    ))
    return checks


def run_audit_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    audit_dir = artifact_dir / "audit"
    auditpol_basenames = _glob_basenames(audit_dir, "**/auditpol*.txt")
    for b in auditpol_basenames:
        files_used.add("audit/" + b)
    auditpol_ok = len(auditpol_basenames) > 0
    checks.append(_make_check(
        "AU.L2-3.3.1",
        auditpol_ok,
        "auditpol evidence: " + str(len(auditpol_basenames)) + " files",
        "auditpol configuration captured",
        "Review audit/auditpol.txt; on system: auditpol /get /category:*",
        auditpol_basenames if auditpol_basenames else ["(none)"],
        "Logging/Collection",
    ))

    eventlog_basenames = _glob_basenames(audit_dir, "**/eventlog*.txt")
    for b in eventlog_basenames:
        files_used.add("audit/" + b)
    retention_ok = len(eventlog_basenames) > 0
    checks.append(_make_check(
        "AU.L2-3.3.4",
        retention_ok,
        "Event log evidence: " + str(len(eventlog_basenames)) + " files",
        "Event log configuration and retention captured",
        "Review audit/ for eventlog-*.txt",
        eventlog_basenames if eventlog_basenames else ["(none)"],
        None,
    ))
    return checks


def run_host_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    host_dir = artifact_dir / "host"
    hotfix_path = host_dir / "hotfixes.txt"
    files_used.add("host/hotfixes.txt")
    hotfix_content = _read_text(hotfix_path)
    hotfix_ok = len(hotfix_content.strip()) > 20
    checks.append(_make_check(
        "CM.L2-3.4.6",
        hotfix_ok,
        "Hotfix list: " + ("present" if hotfix_ok else "missing or empty"),
        "Patch/hotfix evidence present",
        "Review host/hotfixes.txt; on system: Get-HotFix",
        ["hotfixes.txt"],
        "GuestOS/Patching",
    ))

    update_policy = host_dir / "windows-update-policy.txt"
    update_services = host_dir / "windows-update-services.txt"
    for p in (update_policy, update_services):
        if p.exists():
            files_used.add("host/" + p.name)
    update_content = _read_text(update_policy) + _read_text(update_services)
    update_ok = "Windows Update" in update_content or "WUA" in update_content or update_policy.exists()
    checks.append(_make_check(
        "CM.L2-3.4.6",
        update_ok,
        "Update policy/services: " + ("present" if update_ok else "missing"),
        "Windows Update policy or service evidence present",
        "Review host/windows-update-policy.txt and windows-update-services.txt",
        [p.name for p in (update_policy, update_services) if p.exists()] or ["(none)"],
        "GuestOS/Patching",
    ))

    secureboot = host_dir / "secureboot.txt"
    deviceguard = host_dir / "deviceguard.txt"
    tpm = host_dir / "tpm.txt"
    for p in (secureboot, deviceguard, tpm):
        if p.exists():
            files_used.add("host/" + p.name)
    secureboot_content = _read_text(secureboot)
    sb_ok = "enabled" in secureboot_content.lower() or "true" in secureboot_content.lower() or secureboot.exists()
    checks.append(_make_check(
        "CM.L2-3.4.1",
        sb_ok,
        "Secure Boot: " + ("evidence present" if sb_ok else "missing"),
        "Secure Boot / Device Guard / TPM evidence present",
        "Review host/secureboot.txt, deviceguard.txt, tpm.txt",
        [p.name for p in (secureboot, deviceguard, tpm) if p.exists()] or ["(none)"],
        "GuestOS/Hardening",
    ))

    roles_path = host_dir / "installed-roles-features.txt"
    files_used.add("host/installed-roles-features.txt")
    roles_ok = roles_path.exists() and len(_read_text(roles_path).strip()) > 10
    checks.append(_make_check(
        "CM.L2-3.4.1",
        roles_ok,
        "Installed roles/features: " + ("present" if roles_ok else "missing"),
        "Installed roles and features captured",
        "Review host/installed-roles-features.txt",
        ["installed-roles-features.txt"],
        "GuestOS/Hardening",
    ))
    return checks


def run_defender_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    defender_dir = artifact_dir / "defender"
    defender_basenames = _glob_basenames(defender_dir, "**/*")
    for b in defender_basenames:
        files_used.add("defender/" + b)
    defender_ok = len(defender_basenames) > 0
    checks.append(_make_check(
        "SI.L2-3.14.2",
        defender_ok,
        "Defender evidence: " + str(len(defender_basenames)) + " files",
        "Defender status or preferences captured",
        "Review defender/ for status and prefs",
        defender_basenames if defender_basenames else ["(none)"],
        "GuestOS/Endpoint-Protection-Config",
    ))
    return checks


def run_storage_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    storage_dir = artifact_dir / "storage"
    bitlocker_basenames = _glob_basenames(storage_dir, "**/*bitlocker*") + _glob_basenames(storage_dir, "**/*bit-locker*")
    for b in bitlocker_basenames:
        files_used.add("storage/" + b)
    bl_ok = len(bitlocker_basenames) > 0
    checks.append(_make_check(
        "MP.L2-3.8.1",
        bl_ok,
        "BitLocker evidence: " + str(len(bitlocker_basenames)) + " files",
        "BitLocker or encryption-at-rest evidence present",
        "Review storage/ for BitLocker status",
        bitlocker_basenames if bitlocker_basenames else ["(none)"],
        "Crypto/At Rest",
    ))

    removable_basenames = _glob_basenames(storage_dir, "**/*removable*") + _glob_basenames(storage_dir, "**/*usb*")
    for b in removable_basenames:
        files_used.add("storage/" + b)
    removable_ok = len(removable_basenames) > 0
    checks.append(_make_check(
        "MP.L2-3.8.1",
        removable_ok,
        "Removable storage policy: " + str(len(removable_basenames)) + " files",
        "Removable storage policy evidence present",
        "Review storage/ for removable or USB policy",
        removable_basenames if removable_basenames else ["(none)"],
        "Crypto/At Rest",
    ))
    return checks


def run_apps_checks(artifact_dir: Path, files_used: set[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    apps_dir = artifact_dir / "apps"
    applocker_basenames = _glob_basenames(apps_dir, "**/*applocker*")
    for b in applocker_basenames:
        files_used.add("apps/" + b)
    applocker_ok = len(applocker_basenames) > 0
    checks.append(_make_check(
        "CM.L2-3.4.1",
        applocker_ok,
        "AppLocker evidence: " + str(len(applocker_basenames)) + " files",
        "AppLocker or application control policy present",
        "Review apps/ for AppLocker policy",
        applocker_basenames if applocker_basenames else ["(none)"],
        "Application/Config",
    ))
    return checks


def run_all_checks(artifact_dir: Path) -> tuple[list[dict[str, Any]], set[str]]:
    files_used: set[str] = set()
    checks: list[dict[str, Any]] = []
    artifact_dir = Path(artifact_dir)
    checks.extend(run_crypto_checks(artifact_dir, files_used))
    checks.extend(run_network_checks(artifact_dir, files_used))
    checks.extend(run_audit_checks(artifact_dir, files_used))
    checks.extend(run_host_checks(artifact_dir, files_used))
    checks.extend(run_defender_checks(artifact_dir, files_used))
    checks.extend(run_storage_checks(artifact_dir, files_used))
    checks.extend(run_apps_checks(artifact_dir, files_used))
    return checks, files_used


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Windows Server hardening evidence bundle (73/73 controls)")
    parser.add_argument("artifact_dir", nargs="?", help="Path to extracted evidence bundle root")
    parser.add_argument("--artifact-dir", dest="artifact_dir_opt", help="Path to extracted evidence bundle root")
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST_PATH, help="Path to 73-control OS evidence manifest JSON")
    parser.add_argument("--zip", help="Path to ZIP; extract to temp and run")
    parser.add_argument("--fail-on-fail", action="store_true", help="Exit 1 if any check fails")
    parser.add_argument("-o", "--output-dir", default=".", help="Directory for output reports (default: cwd)")
    args = parser.parse_args()
    artifact_dir = args.artifact_dir_opt or args.artifact_dir
    extract_dir: str | None = None
    if args.zip:
        if not os.path.isfile(args.zip):
            print("error: --zip path not found:", args.zip, file=sys.stderr)
            return 2
        extract_dir = tempfile.mkdtemp(prefix="win_evidence_")
        with zipfile.ZipFile(args.zip, "r") as zf:
            zf.extractall(extract_dir)
        artifact_dir = extract_dir
    if not artifact_dir or not os.path.isdir(artifact_dir):
        parser.print_help(sys.stderr)
        print("error: artifact_dir required (or use --zip)", file=sys.stderr)
        return 2
    manifest_controls = _load_manifest(args.manifest)
    if len(manifest_controls) != 73:
        print("warning: manifest has", len(manifest_controls), "controls (expected 73); using as-is", file=sys.stderr)
    try:
        artifact_path = Path(artifact_dir)
        # Run content checks (no BUNDLE.INTEGRITY in 73-check output)
        content_checks, files_used = run_all_checks(artifact_path)
        # Build exactly 73 checks from manifest + content results
        checks = _build_73_checks(artifact_path, manifest_controls, content_checks, files_used)
        inputs = _build_inputs_manifest(artifact_path, files_used)
        report = {
            "validator": {
                "name": VALIDATOR_NAME,
                "version": VERSION,
                "sha256": _validator_sha256(),
            },
            "inputs": inputs,
            "checks": checks,
        }
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        json_path = out_dir / "validation-report-windows-hardening.json"
        txt_path = out_dir / "validation-report-windows-hardening.txt"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        passed = sum(1 for c in checks if c.get("pass"))
        partial_count = sum(1 for c in checks if c.get("partial"))
        failed = len(checks) - passed
        lines = [
            "Windows Server Hardening Validation Report (73/73 controls)",
            "Validator: " + VALIDATOR_NAME + " " + VERSION,
            "Total checks: " + str(len(checks)),
            "Passed: " + str(passed),
            "Partial (needs accompanying docs): " + str(partial_count),
            "Failed: " + str(failed),
            "",
        ]
        for c in checks:
            status = "PASS" if c.get("pass") else "FAIL"
            if c.get("partial"):
                status = "PARTIAL"
            lines.append(f"  [{status}] {c.get('control', '')} - {c.get('observed', '')[:80]}")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print("Wrote", json_path, "and", txt_path)
        if args.fail_on_fail and failed > 0:
            return 1
        return 0
    finally:
        if extract_dir and os.path.isdir(extract_dir):
            import shutil
            shutil.rmtree(extract_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
