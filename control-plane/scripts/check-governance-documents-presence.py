#!/usr/bin/env python3
"""
Check presence of each required governance document (from Governance_Required_Documents_List.csv).
Uses same search order and aliases as build-quality-app-documents-zip.sh.
Output: Governance_Documents_Presence_Checklist.csv
"""
import csv
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PARENT = os.path.dirname(REPO_ROOT)
MACTECH_BASE = os.environ.get("MACTECH_BASE", "/Users/patrick/mactech")

SEARCH_DIRS = [
    os.path.join(MACTECH_BASE, "compliance/cmmc/level2/02-policies-and-procedures"),
    os.path.join(MACTECH_BASE, "compliance/cmmc/level2/01-system-security-plan"),
    os.path.join(PARENT, "TRUST_CODEX/cmmc-governing-records-bundle/docs/02-policies-and-procedures"),
    os.path.join(PARENT, "TRUST_CODEX/cmmc-governing-records-bundle/docs/01-system-scope"),
    os.path.join(PARENT, "TRUST_CODEX/cmmc-governing-records-bundle/docs/06-supporting-documents"),
    os.path.join(PARENT, "TRUST_CODEX/cmmc-governing-records-bundle/docs"),
    os.path.join(PARENT, "TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/02-policies-and-procedures"),
    os.path.join(PARENT, "TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/01-system-scope"),
    os.path.join(PARENT, "TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/06-supporting-documents"),
    os.path.join(PARENT, "TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2"),
    os.path.join(REPO_ROOT, "MacTech_CUI_Enclave_Governance_Bundle_2025-03-01"),
    os.path.join(REPO_ROOT, "MacTech_CUI_Enclave_Governance_Bundle_2025-03-01/docs/cui-enclave-governance"),
    os.path.join(REPO_ROOT, "docs/cui-enclave-governance"),
]

# Aliases: want_basename -> list of alt basenames to try (first found wins)
ALIASES = {
    "MAC-POL-001_Record_Retention_Policy.md": ["MAC-POL-001_Record_Retention_Policy.md", "MAC-POL-227_Record_Retention_Policy.md"],
    "MAC-POL-213_Media_Handling_and_Data_Disposal_Policy.md": ["MAC-POL-213_Media_Handling_and_Data_Disposal_Policy.md", "MAC-POL-213_Media_Handling_Policy.md"],
    "MAC-SOP-230_Vulnerability_Scanning_and_Remediation_Procedure.md": ["MAC-SOP-230_Vulnerability_Scanning_and_Remediation_Procedure.md", "MAC-SOP-230_Vulnerability_Scanning_Procedure.md"],
    "MAC-SOP-231_POAM_Process_Procedure.md": ["MAC-SOP-231_POAM_Process_Procedure.md", "MAC-SOP-231_POA&M_Process_Procedure.md"],
    "MAC-IT-307_System_Security_Plan.md": ["MAC-IT-307_System_Security_Plan.md", "MAC-IT-304_System_Security_Plan.md"],
    "MAC-IT-308_System_Boundary_and_Scope.md": ["MAC-IT-308_System_Boundary_and_Scope.md", "MAC-IT-105_System_Boundary.md", "System_Boundary_and_Scope_MacTech_CUI_Enclave.md"],
}


def find_doc(want_basename: str):
    """Return (found, resolved_path, notes)."""
    if "???" in want_basename:
        return False, "", "Placeholder; document to be created"
    alts = ALIASES.get(want_basename, [want_basename])
    for d in SEARCH_DIRS:
        if not os.path.isdir(d):
            continue
        for alt in alts:
            path = os.path.join(d, alt)
            if os.path.isfile(path):
                note = f"alias: {alt}" if alt != want_basename else ""
                return True, path, note
    return False, "", ""


def main():
    list_path = os.path.join(REPO_ROOT, "docs/Governance_Required_Documents_List.csv")
    out_path = os.path.join(REPO_ROOT, "docs/Governance_Documents_Presence_Checklist.csv")
    with open(list_path) as f:
        r = list(csv.reader(f))
    header = r[0]
    rows = r[1:]
    out = [["Document ID", "Required", "Found", "Resolved path", "Notes"]]
    for row in rows:
        if not row:
            continue
        basename = row[0]
        required = "Y"
        found, resolved, notes = find_doc(basename)
        out.append([basename, required, "Y" if found else "N", resolved, notes])
    with open(out_path, "w", newline="") as f:
        csv.writer(f).writerows(out)
    print(f"Wrote {out_path}")
    missing = [r[0] for r in out[1:] if r[2] == "N"]
    if missing:
        print("Missing:", missing)


if __name__ == "__main__":
    main()
