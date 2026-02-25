# Class A Controls Not Yet Implemented (Pilot) — Closeout Plan

## Summary

- **Class A not yet implemented**: 61 / 80

## Windows-closeable via hardening + validation (script-supported)

The following Class A controls can be closed at the VM layer after running:
- `Invoke-CuiHardening.ps1` (change-making)
- `Test-CuiHardening.ps1` (read-only validation)
- `Collect-Cui-Evidence.ps1` (read-only evidence bundle)

| Control ID | Title | Hardening outcome | Validation | Evidence |
|---|---|---|---|---|
| AC.L2-3.1.10 | Session lock | Secure screen saver enabled and locked with timeout aligned to inactivity limit. | `SESSION-LOCK` PASS | `screensaver-policy.txt` + validation report |
| AC.L2-3.1.9 | Privacy/security notices | (Optional) interactive logon banner (approved text required). | (optional) | `interactive-logon-notice.txt` |
| IA.L2-3.5.10 | Cryptographically-protected passwords | `LmCompatibilityLevel=5` and `NoLmHash=1`. | `NTLMV2` PASS | `ntlm-policy.txt` + validation report |
| IA.L2-3.5.11 | Obscure authentication feedback | `DontDisplayLastUserName=1`. | `AUTH-UX` PASS | `auth-ux-policy.txt` + validation report |
| IA.L2-3.5.8 | Prohibit password reuse | Password history enforced to >= 24 (via `net accounts /uniquepw:24`). | `PW-HISTORY` PASS | `net-accounts.txt` + validation report |

## Full list — remaining Class A not implemented (bucketed by primary dependency)

| Control ID | Family | Title | Primary dependency to close |
|---|---|---|---|
| AC.L2-3.1.1 | AC | Limit system access to authorized users, processes, devices | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.10 | AC | Session lock | Windows hardening closeable |
| AC.L2-3.1.12 | AC | Monitor remote access | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.13 | AC | Cryptographic remote access | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.14 | AC | Managed access control points | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.15 | AC | Authorize remote privileged commands | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.18 | AC | Control mobile devices | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.19 | AC | Encrypt CUI on mobile devices | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.2 | AC | Limit access to transactions/functions | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.20 | AC | Verify external systems | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.22 | AC | Control CUI on public systems | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.5 | AC | Least privilege | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.6 | AC | Non-privileged accounts | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.7 | AC | Prevent privileged function execution | Azure/Entra/VPN+RDP access dependent |
| AC.L2-3.1.9 | AC | Privacy/security notices | Windows hardening closeable |
| AU.L2-3.3.2 | AU | Unique user traceability | Azure/Entra/VPN+RDP access dependent |
| AU.L2-3.3.4 | AU | Alert on audit logging failure | Tooling/architecture dependent |
| AU.L2-3.3.5 | AU | Correlate audit records | Azure/Entra/VPN+RDP access dependent |
| AU.L2-3.3.6 | AU | Audit record reduction/reporting | Azure/Entra/VPN+RDP access dependent |
| AU.L2-3.3.8 | AU | Protect audit information | Tooling/architecture dependent |
| AU.L2-3.3.9 | AU | Limit audit logging management | Tooling/architecture dependent |
| CM.L2-3.4.5 | CM | Change access restrictions | Operational process dependent |
| CM.L2-3.4.6 | CM | Least functionality | Tooling/architecture dependent |
| CM.L2-3.4.7 | CM | Restrict nonessential programs | Tooling/architecture dependent |
| CM.L2-3.4.8 | CM | Software restriction policy | Tooling/architecture dependent |
| CM.L2-3.4.9 | CM | Control user-installed software | Tooling/architecture dependent |
| IA.L2-3.5.10 | IA | Cryptographically-protected passwords | Windows hardening closeable |
| IA.L2-3.5.11 | IA | Obscure authentication feedback | Windows hardening closeable |
| IA.L2-3.5.2 | IA | Authenticate users | Azure/Entra/VPN+RDP access dependent |
| IA.L2-3.5.3 | IA | MFA for privileged accounts | Azure/Entra/VPN+RDP access dependent |
| IA.L2-3.5.4 | IA | Replay-resistant authentication | Azure/Entra/VPN+RDP access dependent |
| IA.L2-3.5.5 | IA | Prevent identifier reuse | Azure/Entra/VPN+RDP access dependent |
| IA.L2-3.5.6 | IA | Disable identifiers after inactivity | Azure/Entra/VPN+RDP access dependent |
| IA.L2-3.5.8 | IA | Prohibit password reuse | Windows hardening closeable |
| IA.L2-3.5.9 | IA | Temporary passwords | Tooling/architecture dependent |
| MA.L2-3.7.1 | MA | Perform maintenance | Operational process dependent |
| MA.L2-3.7.2 | MA | Controls on maintenance tools | Operational process dependent |
| MA.L2-3.7.5 | MA | MFA for nonlocal maintenance | Operational process dependent |
| MP.L2-3.8.1 | MP | Protect system media | Operational process dependent |
| MP.L2-3.8.2 | MP | Limit access to CUI on media | Operational process dependent |
| MP.L2-3.8.3 | MP | Sanitize/destroy media | Operational process dependent |
| MP.L2-3.8.4 | MP | Mark media with CUI markings | Operational process dependent |
| MP.L2-3.8.5 | MP | Control access during transport | Operational process dependent |
| MP.L2-3.8.6 | MP | Cryptographic protection on digital media | Operational process dependent |
| MP.L2-3.8.8 | MP | Prohibit portable storage without owner | Operational process dependent |
| MP.L2-3.8.9 | MP | Protect backup CUI | Operational process dependent |
| RA.L2-3.11.2 | RA | Scan for vulnerabilities | Azure/Entra/VPN+RDP access dependent |
| RA.L2-3.11.3 | RA | Remediate vulnerabilities | Azure/Entra/VPN+RDP access dependent |
| SC.L2-3.13.10 | SC | Cryptographic key management | Tooling/architecture dependent |
| SC.L2-3.13.12 | SC | Collaborative computing devices | Tooling/architecture dependent |
| SC.L2-3.13.13 | SC | Control mobile code | Tooling/architecture dependent |
| SC.L2-3.13.15 | SC | Protect authenticity of communications | Tooling/architecture dependent |
| SC.L2-3.13.16 | SC | Protect CUI at rest | Tooling/architecture dependent |
| SC.L2-3.13.2 | SC | Architectural designs | Tooling/architecture dependent |
| SC.L2-3.13.3 | SC | Separate user/system management | Tooling/architecture dependent |
| SC.L2-3.13.4 | SC | Prevent unauthorized information transfer | Tooling/architecture dependent |
| SC.L2-3.13.5 | SC | Implement subnetworks | Tooling/architecture dependent |
| SC.L2-3.13.9 | SC | Terminate network connections | Tooling/architecture dependent |
| SI.L2-3.14.3 | SI | Monitor security alerts | Tooling/architecture dependent |
| SI.L2-3.14.5 | SI | Periodic/real-time scans | Tooling/architecture dependent |
| SI.L2-3.14.7 | SI | Identify unauthorized use | Tooling/architecture dependent |
