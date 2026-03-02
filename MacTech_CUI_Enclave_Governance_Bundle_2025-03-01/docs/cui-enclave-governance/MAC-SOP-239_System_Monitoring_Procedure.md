# Procedures for System Monitoring

**Document ID:** MAC-SOP-239  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST controls:** SI.L2-3.14.3 (Monitor security alerts); SI.L2-3.14.7 (Identify unauthorized use)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how security alerts and system monitoring are performed for the MacTech CUI enclave so that security alerts are monitored and unauthorized use is identified. It applies only to the boundary defined in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s) hosted within it, with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Microsoft Defender for Cloud (and any Defender for Endpoint configuration on the Windows VM), Azure Monitor, and any security alerting or monitoring tools configured for the Azure Government subscription and the Windows VM(s). Security alert monitoring and response records for the enclave.
- **Out of scope:** Monitoring of user work computers or systems outside the Azure Government subscription.

---

## 3. Prerequisites

- Access to the Azure Government portal (or equivalent) with permissions to view security alerts and monitoring data.
- Defender for Cloud (and, if used, Defender for Endpoint on the Windows VM) enabled and configured for the enclave.
- Designated personnel responsible for reviewing alerts and taking action (monitoring operator, security/IR).

---

## 4. Procedure

### 4.1 Monitor security alerts (3.14.3)

1. **Frequency.** Review security alerts at least daily during business hours. High-severity and critical alerts shall be reviewed within four (4) hours of generation.
2. **Sources.** Check Microsoft Defender for Cloud > Security alerts (and, if applicable, Defender for Endpoint alerts) for the Azure Government subscription and the Windows VM(s).
3. **Documentation.** For each alert reviewed, document: date/time, alert title, severity, resource (VM/subscription), initial assessment (true positive, false positive, or needs investigation), and any action taken (e.g., ticket opened, remediation step).
4. **Escalation.** Critical severity alerts or confirmed incidents shall be escalated to the Incident Response team or CISO per the Incident Response Policy (MAC-POL-215). Document all escalations with date, alert, and recipient.

### 4.2 Identify unauthorized use (3.14.7)

1. **Review.** Use the same alert sources and Azure/Windows audit logs to identify anomalous or unauthorized activity (e.g., failed logons, unusual access patterns, privilege escalation attempts).
2. **Correlation.** Where possible, correlate alerts with sign-in logs (Entra ID) and Windows security events on the VM to attribute activity to users or accounts.
3. **Actions.** Document actions taken in response to suspected unauthorized use (e.g., account disabled, access revoked, incident opened). Retain records per MacTech’s Records Retention Policy (minimum three (3) years for audit purposes).

---

## 5. Roles and Responsibilities

- **Monitoring operator:** Perform the daily review of alerts; document findings and actions in the security alert review log.
- **Security / Incident Response:** Triage escalated alerts and lead response to confirmed incidents.
- **System owner:** Ensure Defender for Cloud and monitoring tools remain enabled and configured for the enclave.

---

## 6. Evidence and Records

- Security alert review log (date, alert, severity, assessment, action).
- Records of actions taken in response to monitoring (tickets, remediation notes).
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- System and Information Integrity Policy (MAC-POL-214)
- Incident Response Policy (MAC-POL-215)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
