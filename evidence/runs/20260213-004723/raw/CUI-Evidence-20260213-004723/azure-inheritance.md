# Azure inheritance / shared responsibility

Generated: 2026-02-07T23:13:13.8821671Z
RunId: 20260207-231313

## Boundary statement

Microsoft Azure provides datacenter physical security and platform operations. Customer remains responsible for enclave configuration: identity, network rules, OS hardening, logging/monitoring, and governance.

## Azure-related controls (from implementation map)

- **AC.L2-3.1.1** - Limit system access to authorized users, processes, devices (shared)
- **AC.L2-3.1.12** - Monitor remote access (shared)
- **AC.L2-3.1.13** - Cryptographic remote access (shared)
- **AC.L2-3.1.14** - Managed access control points (shared)
- **AC.L2-3.1.15** - Authorize remote privileged commands (shared)
- **AC.L2-3.1.18** - Control mobile devices (shared)
- **AC.L2-3.1.19** - Encrypt CUI on mobile devices (shared)
- **AC.L2-3.1.2** - Limit access to transactions/functions (shared)
- **AC.L2-3.1.20** - Verify external systems (shared)
- **AC.L2-3.1.21** - Limit portable storage (shared)
- **AC.L2-3.1.22** - Control CUI on public systems (shared)
- **AC.L2-3.1.3** - Control flow of CUI (shared)
- **AC.L2-3.1.5** - Least privilege (shared)
- **AC.L2-3.1.6** - Non-privileged accounts (shared)
- **AC.L2-3.1.7** - Prevent privileged function execution (shared)
- **AU.L2-3.3.1** - Create and retain audit logs (shared)
- **AU.L2-3.3.2** - Unique user traceability (shared)
- **AU.L2-3.3.4** - Alert on audit logging failure (shared)
- **AU.L2-3.3.5** - Correlate audit records (shared)
- **AU.L2-3.3.6** - Audit record reduction/reporting (shared)
- **AU.L2-3.3.7** - System clock synchronization (shared)
- **AU.L2-3.3.8** - Protect audit information (shared)
- **AU.L2-3.3.9** - Limit audit logging management (shared)
- **MA.L2-3.7.1** - Perform maintenance (shared)
- **MA.L2-3.7.2** - Controls on maintenance tools (shared)
- **MP.L2-3.8.1** - Protect system media (shared)
- **MP.L2-3.8.2** - Limit access to CUI on media (shared)
- **MP.L2-3.8.3** - Sanitize/destroy media (shared)
- **MP.L2-3.8.4** - Mark media with CUI markings (shared)
- **MP.L2-3.8.5** - Control access during transport (shared)
- **MP.L2-3.8.6** - Cryptographic protection on digital media (shared)
- **MP.L2-3.8.7** - Control removable media (shared)
- **MP.L2-3.8.8** - Prohibit portable storage without owner (shared)
- **MP.L2-3.8.9** - Protect backup CUI (shared)
- **RA.L2-3.11.2** - Scan for vulnerabilities (shared)
- **RA.L2-3.11.3** - Remediate vulnerabilities (shared)
- **SC.L2-3.13.1** - Monitor/control/protect communications (shared)
- **SC.L2-3.13.10** - Cryptographic key management (azure_resource)
- **SC.L2-3.13.12** - Collaborative computing devices (shared)
- **SC.L2-3.13.13** - Control mobile code (shared)
- **SC.L2-3.13.15** - Protect authenticity of communications (shared)
- **SC.L2-3.13.16** - Protect CUI at rest (shared)
- **SC.L2-3.13.2** - Architectural designs (shared)
- **SC.L2-3.13.3** - Separate user/system management (shared)
- **SC.L2-3.13.4** - Prevent unauthorized information transfer (shared)
- **SC.L2-3.13.5** - Implement subnetworks (azure_resource)
- **SC.L2-3.13.6** - Deny-by-default network communications (shared)
- **SC.L2-3.13.8** - Cryptographic mechanisms for CUI in transit (shared)
- **SC.L2-3.13.9** - Terminate network connections (shared)
- **SI.L2-3.14.1** - Identify/report/correct flaws (shared)
- **SI.L2-3.14.2** - Malicious code protection (shared)
- **SI.L2-3.14.3** - Monitor security alerts (shared)
- **SI.L2-3.14.4** - Update malicious code protection (shared)
- **SI.L2-3.14.5** - Periodic/real-time scans (shared)
- **SI.L2-3.14.6** - Monitor systems and communications (shared)
- **SI.L2-3.14.7** - Identify unauthorized use (shared)

## Inherited controls (from SCTM classification)

- **PE.L2-3.10.1** - Limit physical access
- **PE.L2-3.10.2** - Protect and monitor facility
- **PE.L2-3.10.3** - Escort and monitor visitors
- **PE.L2-3.10.4** - Physical access audit logs
- **PE.L2-3.10.5** - Control physical access devices

## Evidence expectations

- Retain provider attestation snapshot(s) (e.g., SOC reports, compliance offerings) as applicable to inherited controls.
- Retain SRM review record (initial + annual + per material change).
- Retain Azure configuration exports (NSG, Bastion, VM properties, disks encryption settings).

