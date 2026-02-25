# Enclave-enforced control coverage (73 total)

This document explains how the **73 enclave System-Enforced controls** (excluding the 7 Azure/Entra controls) are satisfied: **30** by automated validator checks, **43** by evidence presence, design, or manual/governance.

## Summary

| Bucket | Count | How validated |
|--------|--------|----------------|
| **Automated validator** | 30 control IDs (39 checks) | `Test-CuiHardening.ps1` produces PASS/FAIL per check; evidence bundle + config must pass. |
| **43-control evidence/design** | 43 control IDs | `Test-EnclaveEvidencePresence.ps1` produces PASS/FAIL per control: **evidence presence** (required files in bundle) or **design/NA** (control listed in `enclave-scope-na.json` in the bundle). |

## 30 controls covered by the validator (39 checks)

The validator (`Test-CuiHardening.ps1`) emits 39 checks that map to these **30 unique control IDs**:

AC.L2-3.1.1, AC.L2-3.1.3, AC.L2-3.1.5, AC.L2-3.1.8, AC.L2-3.1.9, AC.L2-3.1.10, AC.L2-3.1.11, AC.L2-3.1.12, AC.L2-3.1.21, AU.L2-3.3.1, AU.L2-3.3.7, CM.L2-3.4.1, CM.L2-3.4.2, CM.L2-3.4.5, CM.L2-3.4.8, IA.L2-3.5.1, IA.L2-3.5.7, IA.L2-3.5.8, IA.L2-3.5.10, IA.L2-3.5.11, MP.L2-3.8.1, MP.L2-3.8.7, SC.L2-3.13.1, SC.L2-3.13.6, SC.L2-3.13.8, SC.L2-3.13.11, SI.L2-3.14.1, SI.L2-3.14.2, SI.L2-3.14.4, SI.L2-3.14.6.

For these, **compliance** = validator PASS for all required checks for that control + evidence bundle present and hashed. See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`.

---

## 43 enclave-enforced controls (evidence/design validation)

These are **System-Enforced (Class A)** but do **not** have a configuration check in `Test-CuiHardening.ps1`. They **are** validated by `Test-EnclaveEvidencePresence.ps1`, which runs after the main validator in the same run:

- **Evidence presence:** For each control, the script requires specific evidence files in the bundle (see `vm-scripts/enclave-43-evidence-requirements.json`). If all required files are present → **PASS**.
- **Design/NA:** Controls satisfied by scope (e.g. no mobile devices) must be listed in `enclave-scope-na.json` in the evidence bundle with a reason. The collector copies `vm-scripts/enclave-scope-na.json` into each bundle so design/NA controls pass.
- **Governance:** MA.L2-3.7.1, MP.L2-3.8.9, SC.L2-3.13.2 require the manifest file and are attested in `enclave-scope-na.json` under `governance_attested`.

So we **do** validate the 43: each run produces `validation-report-43-controls.txt` and `validation-report-43-controls.json` in the same `CUI-Validation-<RunId>` folder. **Passing the other 43** = 43/43 PASS in that report (same as 39/39 for the main validator).

| Control ID | Title | How satisfied (pilot) |
|------------|--------|-------------------------|
| AC.L2-3.1.2 | Limit access to transactions/functions | Evidence: session config, least-privilege; access path design. |
| AC.L2-3.1.6 | Non-privileged accounts | Evidence: local-admins.txt, secpol; design: limited admin use. |
| AC.L2-3.1.7 | Prevent privileged function execution | Evidence: UAC, secpol; validator covers UAC-PROMPT. |
| AC.L2-3.1.13 | Cryptographic remote access | Design: RDP over VPN; evidence: rdp-policy, network path. |
| AC.L2-3.1.14 | Managed access control points | Evidence: firewall, NSG; design: single VM, managed access. |
| AC.L2-3.1.15 | Authorize remote privileged commands | Evidence: who can run what; session/audit evidence. |
| AC.L2-3.1.18 | Control mobile devices | Design: no mobile in scope; N/A or policy. |
| AC.L2-3.1.19 | Encrypt CUI on mobile devices | Design: no mobile; N/A. |
| AC.L2-3.1.20 | Verify external systems | Design: no external interconnections for CUI; N/A or boundary doc. |
| AC.L2-3.1.22 | Control CUI on public systems | Design: no public systems for CUI; N/A. |
| AU.L2-3.3.2 | Unique user traceability | Evidence: auditpol, event logs; design: one admin user / traceable. |
| AU.L2-3.3.4 | Alert on audit logging failure | Evidence: eventlog config; manual or SIEM later. |
| AU.L2-3.3.5 | Correlate audit records | Evidence: timestamps, event logs; manual correlation. |
| AU.L2-3.3.6 | Audit record reduction/reporting | Evidence: auditpol, eventlog; manual review. |
| AU.L2-3.3.8 | Protect audit information | Evidence: permissions, logging config. |
| AU.L2-3.3.9 | Limit audit logging management | Evidence: secpol, who can change audit; design. |
| CM.L2-3.4.6 | Least functionality | Evidence: roles/features, applocker; design. |
| CM.L2-3.4.7 | Restrict nonessential programs | Evidence: applocker-policy, installed-software. |
| CM.L2-3.4.9 | Control user-installed software | Evidence: applocker, policy; design. |
| IA.L2-3.5.2 | Authenticate users | Evidence: sign-in, local accounts; access path. |
| IA.L2-3.5.9 | Temporary passwords | Evidence: account policy, net-accounts; policy. |
| MA.L2-3.7.1 | Perform maintenance | Evidence: maintenance procedures; governance. |
| MA.L2-3.7.2 | Controls on maintenance tools | Evidence: who has admin, tool use; governance. |
| MP.L2-3.8.2 | Limit access to CUI on media | Design: USB disabled (USBSTOR check); evidence: usbstor. |
| MP.L2-3.8.3 | Sanitize/destroy media | Design: no removable CUI media; policy. |
| MP.L2-3.8.4 | Mark media with CUI markings | Design: no physical CUI media in scope; policy. |
| MP.L2-3.8.5 | Control access during transport | Design: no transport of CUI media; N/A or policy. |
| MP.L2-3.8.6 | Cryptographic protection on digital media | Evidence: BitLocker (validator BITLOCKER-OS); design. |
| MP.L2-3.8.8 | Prohibit portable storage without owner | Design: USB disabled; evidence: usbstor, policy. |
| MP.L2-3.8.9 | Protect backup CUI | Evidence: backup procedures; governance. |
| RA.L2-3.11.2 | Scan for vulnerabilities | Evidence: Defender, update policy; SI.L2-3.14.x. |
| RA.L2-3.11.3 | Remediate vulnerabilities | Evidence: hotfixes, update policy; procedures. |
| SC.L2-3.13.2 | Architectural designs | Evidence: network diagram, boundary; docs. |
| SC.L2-3.13.3 | Separate user/system management | Evidence: roles, secpol; design. |
| SC.L2-3.13.4 | Prevent unauthorized information transfer | Evidence: firewall, RDP redirection (validator); design. |
| SC.L2-3.13.9 | Terminate network connections | Evidence: session/inactivity (validator INACTIVITY); design. |
| SC.L2-3.13.12 | Collaborative computing devices | Design: no collaborative devices in scope; N/A. |
| SC.L2-3.13.13 | Control mobile code | Evidence: applocker, browser/config; design. |
| SC.L2-3.13.15 | Protect authenticity of communications | Evidence: TLS (validator CRYPTO-TLS), SMB signing; design. |
| SC.L2-3.13.16 | Protect CUI at rest | Evidence: BitLocker (validator BITLOCKER-OS); design. |
| SI.L2-3.14.3 | Monitor security alerts | Evidence: Defender, event logs; procedures. |
| SI.L2-3.14.5 | Periodic/real-time scans | Evidence: Defender status (validator DEFENDER-ON); design. |
| SI.L2-3.14.7 | Identify unauthorized use | Evidence: audit, event logs; procedures. |

---

## Stress test implication

- **39/39 validator checks PASS** → the **30** control IDs are configuration + evidence compliant for that run.
- **43/43 evidence/design checks PASS** → the **43** controls are validated (evidence files present or design/NA listed in manifest). The runbook runs `Test-EnclaveEvidencePresence.ps1` after `Test-CuiHardening.ps1`; both reports are in `CUI-Validation-<RunId>`.
- **Full enclave pass** = 39/39 + 43/43 (no FAILs in either report).

---

## References

- `vm-scripts/Test-CuiHardening.ps1` — 39 checks, 30 unique control IDs.
- `vm-scripts/Test-EnclaveEvidencePresence.ps1` — 43 checks (evidence presence or design/NA); uses `vm-scripts/enclave-43-evidence-requirements.json` and `vm-scripts/enclave-scope-na.json` (copied into bundle by collector).
- `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` — Rule: claim Met only when validator agrees for controls with required checks.
- `tables/evidence-index.json` — Evidence types and regeneration methods per control.
- `manual_app/manual-data.json` — Classification (System-Enforced), implementation_domain, evidence.
