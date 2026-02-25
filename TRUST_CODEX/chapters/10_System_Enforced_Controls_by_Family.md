# System-Enforced Controls (narrative by family)

This chapter explains, in plain language, **why** each control family exists and **how** the pilot’s technical design will satisfy the intent.

This chapter is a narrative overview. The explicit control-by-control mapping (110 rows) is in:
- `tables/CONTROL_MAPPING_800-171R2.md`

Supporting evidence references are in:
- `tables/EVIDENCE_INDEX.md`
- `tables/CLASS_A_IMPLEMENTATION_PLAN.md` (engineer-actionable; **no auto-apply**)

NIST SP 800-171 Rev.3 (May 2024) is referenced as explanatory context (not the controlling requirement set for this Rev.2 mapping): [NIST SP 800-171r3](https://doi.org/10.6028/NIST.SP.800-171r3).

## What “system-enforced” means in this Codex

For Class A controls, “system-enforced” means:
- The requirement intent is primarily satisfied by technical configuration (identity, OS hardening, network boundaries, cryptography, logging).
- Evidence is technically verifiable and can be **re-generated** (export, query, script output).
- Governance may still exist (approvals, SOPs), but the **primary** satisfaction is technical.

## Access Control (AC)

Intent: prevent unauthorized access, constrain privileges, and control remote access.

Pilot enforcement themes:
- Entra ID identity + role-based access for administrative functions
- VPN + RDP administrative access (no public RDP)
- Default prohibition on removable media and session redirection

How this is enforced (pilot):
- **Single controlled access path**: administrative access is VPN + RDP to the enclave VM; direct public RDP is not used.
- **Least privilege**: privileged roles are assigned explicitly; optional privileged identity management can time-bound elevation.
- **Session controls**: session lock/termination and account protections are configured at the OS/identity layers.

What evidence looks like:
- VPN/NSG configuration exports and Entra sign-in/session logs
- Role assignment exports
- OS/identity policy exports showing session and login protections
See `tables/EVIDENCE_INDEX.md` for per-control evidence items.

## Audit and Accountability (AU)

Intent: produce reliable records of security-relevant actions.

Pilot enforcement themes:
- Centralized logging
- Time synchronization
- Defined retention baseline (1 year)
- Defined log review cadence (governance + technical support)

How this is enforced (pilot):
- **Central collection** of security-relevant logs from enclave systems and access paths.
- **Protection** of audit records (controlled access and integrity expectations).
- **Time alignment** so events can be correlated across systems.

What evidence looks like:
- Logging pipeline configuration exports
- Retention settings proof and sample queries demonstrating event presence/correlation
- Alerting configuration for logging failures
See `tables/EVIDENCE_INDEX.md` and `tables/CLASS_A_IMPLEMENTATION_PLAN.md`.

## Identification and Authentication (IA)

Intent: uniquely identify users and require strong authentication for privileged and non-privileged access.

Pilot enforcement themes:
- Entra ID authentication and conditional access/MFA policies
- Privileged access governance (optional PIM)

How this is enforced (pilot):
- **Unique identities** in Entra ID (no shared accounts as a system baseline).
- **MFA enforcement** via Conditional Access (privileged and non-privileged, per mapping).
- **Account lifecycle controls** via joiner/mover/leaver processes supported by Entra configuration and governance records.

What evidence looks like:
- Conditional Access exports (policy JSON)
- Authentication method/MFA configuration exports
- Sign-in log exports demonstrating enforcement
See `tables/EVIDENCE_INDEX.md`.

## Configuration Management (CM)

Intent: keep the enclave in a known-secure state and prevent drift or insecure change.

How this is enforced (pilot):
- **Hardened baseline** for Windows Server 2025 enclave systems.
- **Least functionality**: disable/remove nonessential services and software where feasible.
- **Drift detection**: periodic verification outputs compared against the baseline.

What evidence looks like:
- Baseline and applied policy exports
- Drift check outputs and exception handling records (if any)
See `tables/CLASS_A_IMPLEMENTATION_PLAN.md` for planned verification methods.

## Maintenance (MA) — system-enforced elements

Intent: ensure maintenance activities do not introduce unauthorized access or data exposure.

How this is enforced (pilot):
- Maintenance access is **constrained to controlled remote sessions** (VPN + RDP).
- Privileged access requires **strong authentication** and is **logged**.

What evidence looks like:
- Privileged session/access logs and configuration exports
See `tables/EVIDENCE_INDEX.md`.

## Media Protection (MP)

Intent: prevent loss, leakage, or misuse of media containing CUI.

How this is enforced (pilot baseline):
- **No removable media**: USB mass storage is disabled; removable media workflows are not used.
- **Controlled transfer**: any required data movement must be via approved, logged mechanisms (explicitly documented).
- **System media protection**: system storage/backups are encrypted and access-controlled.

What evidence looks like:
- Removable media and redirection disabling proofs (configuration exports/verification outputs)
- Storage encryption and access control evidence

## Risk Assessment (RA) — system-enforced elements

Intent: understand and manage risk, including vulnerabilities, in a repeatable way.

In this pilot, the risk assessment family includes both governance-led and system-enforced elements. The system-enforced portion focuses on **vulnerability visibility and remediation evidence**.

How this is enforced (pilot):
- Scheduled vulnerability scanning and remediation tracking (per governance procedure).
- Patch/vulnerability evidence retained to demonstrate ongoing control operation.

What evidence looks like:
- Scan outputs and remediation/patch status evidence

## System and Communications Protection (SC)

Intent: protect confidentiality/integrity in transit and at rest; enforce boundary protections.

Pilot enforcement themes:
- Network segmentation in Azure
- Managed access control points (VPN + RDP; NSG)
- FIPS-validated cryptography requirements addressed by selecting appropriate Windows/Azure cryptographic modules and configurations (to be specified in implementation plan)

How this is enforced (pilot):
- **Segmentation** using Azure VNet/NSGs and controlled ingress/egress.
- **Encrypted sessions** for remote access and data in transit.
- **Cryptography posture** designed to meet FIPS expectations where applicable (explicit configuration and evidence required; not assumed from policy text).

What evidence looks like:
- VNet/NSG exports showing segmentation and access paths
- Cryptographic/TLS configuration evidence and validation outputs (planned)

## System and Information Integrity (SI)

Intent: protect against malicious code, monitor for flaws, and remediate vulnerabilities.

Pilot enforcement themes:
- Endpoint protection for enclave systems
- Patch management and vulnerability remediation processes (governance-supported)

How this is enforced (pilot):
- Endpoint protection enabled and monitored on enclave systems.
- Patching and remediation tracked with verifiable outputs.
- Monitoring for indicators of compromise and unauthorized use.

What evidence looks like:
- Endpoint protection status exports and health reports
- Patch compliance reports and remediation records
See `tables/EVIDENCE_INDEX.md`.

## Governance, inherited, and N/A (where to read next)

Governance-satisfied, inherited, and not-applicable requirements are explained in:
- `chapters/11_Governance_Inherited_and_NA_Controls.md`
- `tables/CLASS_B_INHERITED_NA_SATISFACTION.md`

