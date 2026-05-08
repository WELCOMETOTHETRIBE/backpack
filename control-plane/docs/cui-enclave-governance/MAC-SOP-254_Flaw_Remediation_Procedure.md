# Procedures for Flaw Remediation

**Document ID:** MAC-SOP-254  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SI.L2-3.14.1 (Identify, report, and correct information system flaws in a timely manner)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the organization identifies, reports, and corrects security-relevant flaws in software and firmware affecting the MacTech CUI enclave. It implements the governance requirements of NIST SP 800-171 Rev. 2 control 3.14.1 (Flaw Remediation) and is aligned with the System and Information Integrity Policy (MAC-POL-214). Security-relevant updates include patches, service packs, hot fixes, and anti-virus signatures. Flaws discovered during security assessments, continuous monitoring, incident response, or system error handling are addressed in a timely manner according to risk.

---

## 2. Scope

- **In scope:** In-scope system components as defined in System Boundary and Scope (MAC-SCOPE-001 / MAC-IT-308), including Windows VM(s), management infrastructure, and applications that process, store, or transmit CUI. Identification and remediation of announced software/firmware flaws and flaws discovered internally.
- **Out of scope:** Systems and components explicitly excluded from the CUI enclave boundary.

---

## 3. Prerequisites

- System and Information Integrity Policy (MAC-POL-214) and related procedures (e.g., MAC-SOP-230 Vulnerability Scanning and Remediation) are in effect.
- Designated personnel with information security and system administration responsibilities are assigned.
- Access to vendor security advisories, CVE/CWE resources, and patch or update mechanisms (e.g., Windows Update, WSUS, Intune) as applicable.

---

## 4. Procedure

### 4.1 Identify systems affected by announced flaws

1. **Sources.** Monitor and use: vendor security advisories; NVD/CVE; internal vulnerability scanning results (per MAC-SOP-230); and findings from security assessments, continuous monitoring, or incident response.
2. **Affected systems.** For each announced or discovered flaw, identify which in-scope system components (e.g., OS, firmware, applications) are affected. Document the mapping (e.g., asset or system name, software version, CVE if applicable).

### 4.2 Report flaws to designated personnel

1. **Reporting.** Report identified flaws to designated personnel with information security responsibilities (and system owners as appropriate) in a timely manner. Use the organization’s defined channel (e.g., ticket system, email, or security contact).
2. **Documentation.** Retain a record of reported flaws (e.g., date, source, affected system, severity or risk level). **Retention:** Per Records Retention Policy (minimum three (3) years for security-related records where applicable).

### 4.3 Correct flaws in a timely manner

1. **Risk-based timing.** Remediate flaws in accordance with organizational risk assessment. Apply security-relevant updates (patches, service packs, hot fixes, anti-virus signatures) within the timeframe defined in policy (e.g., critical within 15 days, high within 30 days, or as specified in MAC-POL-214 or risk assessment).
2. **Testing.** Where feasible, test updates in a non-production environment before deployment to production to avoid operational impact. Document testing and deployment steps when required by change control.
3. **Deployment.** Deploy approved updates to affected in-scope systems via the organization’s change and patch management process. Document deployment (e.g., date, system, version applied).
4. **Verification.** Verify that the update was applied successfully (e.g., patch level, scan re-run). Retain evidence. **Retention:** Minimum three (3) years per Records Retention Policy.

### 4.4 Exceptions and deferrals

1. **Deferral.** If remediation cannot be completed within the required timeframe (e.g., vendor delay, compatibility), document the exception: justification, risk acceptance if applicable, and planned remediation date. Obtain approval from CISO or designated authority per policy.
2. **Compensating controls.** Where a patch is not yet available, document and implement compensating controls (e.g., network segmentation, monitoring) and track until the flaw is remediated.

---

## 5. Roles and Responsibilities

- **System / security administrators:** Identify affected systems, apply patches and updates, verify installation, and retain evidence.
- **Personnel with information security responsibilities:** Receive and triage flaw reports; ensure remediation is tracked and completed within policy timeframes; support risk acceptance when needed.
- **CISO / Document Owner:** Approve exceptions and risk acceptances; ensure this procedure is reviewed annually.

---

## 6. Evidence and Records

- Records of announced or discovered flaws (source, date, affected system, CVE or identifier).
- Records of remediation (patch/update applied, date, system, verification).
- Exception or risk acceptance documentation when remediation is deferred.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System and Information Integrity Policy (MAC-POL-214)
- Vulnerability Scanning and Remediation Procedure (MAC-SOP-230)
- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001 / MAC-IT-308)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
