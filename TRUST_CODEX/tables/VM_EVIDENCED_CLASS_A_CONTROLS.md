# VM-Evidenced Class A Controls (Pilot)

**Status column is authoritative from `tables/SCTM_FULL_STATUS_LIST.csv`.** For the single closeout view, use `tables/CONTROL_CLOSEOUT_FROM_SCTM.md` (generated from SCTM).

Definition used for this list: **Class A controls that have deterministic VM CLI evidence artifacts collected by `Collect-Cui-Evidence.ps1`** and are not primarily dependent on procedural media/maintenance handling. Some items still require Azure/Entra evidence (e.g. sign-in logs, role assignments, NSG) to fully close; those are explicitly labeled.

- **Total Class A**: 80
- **VM-evidenced list (this file)**: 65
  - **VM-primary (VM CLI is primary evidence source)**: 52
  - **Shared (Azure control plane evidence also required)**: 13

## VM-primary (VM CLI evidence is primary)

| Control ID | Family | Title | Current status (from SCTM) |
|---|---|---|---|
| AC.L2-3.1.1 | AC | Limit system access to authorized users, processes, devices | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.10 | AC | Session lock | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.11 | AC | Automatic session termination | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.2 | AC | Limit access to transactions/functions | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.21 | AC | Limit portable storage | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.3 | AC | Control flow of CUI | Planned / Partially Evidenced |
| AC.L2-3.1.5 | AC | Least privilege | Planned / Partially Evidenced |
| AC.L2-3.1.6 | AC | Non-privileged accounts | Planned / Partially Evidenced |
| AC.L2-3.1.7 | AC | Prevent privileged function execution | Planned / Partially Evidenced |
| AC.L2-3.1.8 | AC | Limit unsuccessful logon attempts | Implemented (Evidenced on Pilot VM) |
| AC.L2-3.1.9 | AC | Privacy/security notices | Planned / Partially Evidenced |
| AU.L2-3.3.1 | AU | Create and retain audit logs | Implemented (Evidenced on Pilot VM) |
| AU.L2-3.3.2 | AU | Unique user traceability | Planned / Partially Evidenced |
| AU.L2-3.3.4 | AU | Alert on audit logging failure | Planned / Partially Evidenced |
| AU.L2-3.3.5 | AU | Correlate audit records | Planned / Partially Evidenced |
| AU.L2-3.3.6 | AU | Audit record reduction/reporting | Planned / Partially Evidenced |
| AU.L2-3.3.7 | AU | System clock synchronization | Implemented (Evidenced on Pilot VM) |
| AU.L2-3.3.8 | AU | Protect audit information | Planned / Partially Evidenced |
| AU.L2-3.3.9 | AU | Limit audit logging management | Planned / Partially Evidenced |
| CM.L2-3.4.1 | CM | Baseline configurations | Implemented (Evidenced on Pilot VM) |
| CM.L2-3.4.2 | CM | Security configuration settings | Implemented (Evidenced on Pilot VM) |
| CM.L2-3.4.6 | CM | Least functionality | Planned / Partially Evidenced |
| CM.L2-3.4.7 | CM | Restrict nonessential programs | Planned / Partially Evidenced |
| CM.L2-3.4.8 | CM | Software restriction policy | Planned / Partially Evidenced |
| CM.L2-3.4.9 | CM | Control user-installed software | Planned / Partially Evidenced |
| IA.L2-3.5.1 | IA | Identify users | Implemented (Evidenced on Pilot VM) |
| IA.L2-3.5.10 | IA | Cryptographically-protected passwords | Planned / Partially Evidenced |
| IA.L2-3.5.11 | IA | Obscure authentication feedback | Planned / Partially Evidenced |
| IA.L2-3.5.7 | IA | Password complexity | Implemented (Evidenced on Pilot VM) |
| IA.L2-3.5.8 | IA | Prohibit password reuse | Planned / Partially Evidenced |
| MP.L2-3.8.7 | MP | Control removable media | Implemented (Evidenced on Pilot VM) |
| SC.L2-3.13.1 | SC | Monitor/control/protect communications | Implemented (Evidenced on Pilot VM) |
| SC.L2-3.13.10 | SC | Cryptographic key management | Planned / Partially Evidenced |
| SC.L2-3.13.11 | SC | FIPS-validated cryptography | Implemented (Evidenced on Pilot VM) |
| SC.L2-3.13.12 | SC | Collaborative computing devices | Planned / Partially Evidenced |
| SC.L2-3.13.13 | SC | Control mobile code | Planned / Partially Evidenced |
| SC.L2-3.13.15 | SC | Protect authenticity of communications | Planned / Partially Evidenced |
| SC.L2-3.13.16 | SC | Protect CUI at rest | Planned / Partially Evidenced |
| SC.L2-3.13.2 | SC | Architectural designs | Planned / Partially Evidenced |
| SC.L2-3.13.3 | SC | Separate user/system management | Planned / Partially Evidenced |
| SC.L2-3.13.4 | SC | Prevent unauthorized information transfer | Planned / Partially Evidenced |
| SC.L2-3.13.5 | SC | Implement subnetworks | Planned / Partially Evidenced |
| SC.L2-3.13.6 | SC | Deny-by-default network communications | Implemented (Evidenced on Pilot VM) |
| SC.L2-3.13.8 | SC | Cryptographic mechanisms for CUI in transit | Implemented (Evidenced on Pilot VM) |
| SC.L2-3.13.9 | SC | Terminate network connections | Planned / Partially Evidenced |
| SI.L2-3.14.1 | SI | Identify/report/correct flaws | Implemented (Evidenced on Pilot VM) |
| SI.L2-3.14.2 | SI | Malicious code protection | Implemented (Evidenced on Pilot VM) |
| SI.L2-3.14.3 | SI | Monitor security alerts | Planned / Partially Evidenced |
| SI.L2-3.14.4 | SI | Update malicious code protection | Implemented (Evidenced on Pilot VM) |
| SI.L2-3.14.5 | SI | Periodic/real-time scans | Planned / Partially Evidenced |
| SI.L2-3.14.6 | SI | Monitor systems and communications | Implemented (Evidenced on Pilot VM) |
| SI.L2-3.14.7 | SI | Identify unauthorized use | Planned / Partially Evidenced |

## Shared — Azure control plane evidence also required to close

| Control ID | Family | Title | Why not VM-only |
|---|---|---|---|
| AC.L2-3.1.12 | AC | Monitor remote access | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| AC.L2-3.1.13 | AC | Cryptographic remote access | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| AC.L2-3.1.14 | AC | Managed access control points | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| AC.L2-3.1.15 | AC | Authorize remote privileged commands | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| AC.L2-3.1.22 | AC | Control CUI on public systems | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.2 | IA | Authenticate users | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.3 | IA | MFA for privileged accounts | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.4 | IA | Replay-resistant authentication | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.5 | IA | Prevent identifier reuse | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.6 | IA | Disable identifiers after inactivity | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| IA.L2-3.5.9 | IA | Temporary passwords | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| RA.L2-3.11.2 | RA | Scan for vulnerabilities | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
| RA.L2-3.11.3 | RA | Remediate vulnerabilities | Requires Azure/Entra exports/logs in addition to VM configuration snapshots. |
