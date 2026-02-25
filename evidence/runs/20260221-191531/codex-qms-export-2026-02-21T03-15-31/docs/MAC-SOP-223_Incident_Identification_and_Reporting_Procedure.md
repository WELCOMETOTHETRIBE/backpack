# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Incident Identification and Reporting Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-21  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** FAR 52.204-21, IR.L1-3.6.2

**Applies to:** CMMC 2.0 Level 1 (FCI-only system)

---

## 1. Purpose

This procedure provides detailed step-by-step instructions for identifying and reporting security incidents in the MacTech Solutions system. This procedure supports the Incident Response Policy (`MAC-POL-215_Incident_Response_Policy.md`).

---

## 2. Incident Identification Procedure

### 2.1 Detection Methods

Incidents may be identified through:

**Application Event Logs:**
- Review AppEvent table for suspicious activity
- Look for multiple failed login attempts
- Check for unauthorized administrative actions
- Review file upload events for policy violations

**Authentication Logs:**
- Review login and login_failed events
- Identify unusual access patterns
- Check for account compromise indicators

**System Monitoring:**
- Review hosting environment (historical) logs
- Check for system performance degradation
- Monitor for unexpected errors

**User Reports:**
- Users report suspicious activity
- Users report unauthorized access
- Users report system anomalies

**Security Scanning:**
- Review Dependabot alerts
- Review npm audit results
- Check for known vulnerabilities

### 2.2 Indicators of Compromise

Common indicators include:
- Multiple failed login attempts from same IP
- Unusual access patterns (time, location, frequency)
- Unauthorized administrative actions
- System performance degradation
- Unexpected system changes
- Suspicious file uploads
- Policy violations (e.g., CUI upload attempts)

### 2.3 Identification Steps

**Step 1: Observe Anomaly**
- User or system detects unusual activity
- Log review reveals suspicious events
- Monitoring alert triggers

**Step 2: Gather Initial Information**
- Record date and time of observation
- Note affected systems or accounts
- Capture screenshots or logs
- Document initial observations

**Step 3: Assess Severity**
- Determine if incident is critical, high, medium, or low severity
- Critical: Data breach, system compromise, unauthorized FCI access
- High: Account compromise, policy violations
- Medium: Suspicious activity, failed access attempts
- Low: Minor anomalies, false positives

**Step 4: Document Initial Findings**
- Create incident record
- Assign incident ID (if applicable)
- Record discovery time
- Note affected systems

---

## 3. Incident Reporting Procedure

### 3.1 Reporting Timeline

**Critical Incidents:** Report immediately (within 1 hour)
- Suspected data breach
- Unauthorized access to FCI
- System compromise
- Malware infections

**High Severity:** Report within 4 hours
- Account compromise
- Policy violations
- Unauthorized administrative actions

**Medium Severity:** Report within 24 hours
- Suspicious activity
- Multiple failed login attempts
- Unusual access patterns

**Low Severity:** Report within 72 hours
- Minor anomalies
- False positives
- Non-critical issues

### 3.2 Reporting Channels

**Primary Contact:**
- **Email:** security@mactechsolutions.com
- **Phone:** [Designated escalation phone number]

**Alternative Contact:**
- Development team lead
- System administrator

**Note:** CMMC Level 2 does not require DoD or customer notification unless contractually required. The Security Contact determines if external notification is needed.

### 3.3 Report Contents

Incident reports must include:

1. **Incident Description:** What happened
2. **Discovery Time:** When was the incident discovered
3. **Affected Systems:** Which systems or data are affected
4. **Impact Assessment:** Potential or actual impact
5. **Initial Response:** Actions taken so far
6. **Evidence:** Logs, screenshots, or other evidence

### 3.4 Reporting Steps

**Step 1: Prepare Report**
- Gather all relevant information
- Collect evidence (logs, screenshots)
- Document incident details
- Assess initial impact

**Step 2: Contact Security Contact**
- Send email to security@mactechsolutions.com
- Include all required information
- Attach evidence if applicable
- Use subject line: "Security Incident Report - [Severity] - [Brief Description]"

**Step 3: Follow Up**
- Respond to Security Contact questions
- Provide additional information as requested
- Assist with investigation if needed

**Step 4: Document Reporting**
- Record report submission time
- Note Security Contact acknowledgment
- Track incident status

---

## 4. Incident Report Template

```
INCIDENT REPORT
================

Incident ID: [If applicable]
Date/Time Discovered: [Date and time]
Reported By: [Name, email, role]
Reported To: [Security Contact]

INCIDENT DETAILS
----------------
Incident Type: [Unauthorized Access / Data Security / System Integrity / Physical Security]
Severity: [Critical / High / Medium / Low]
Description: [Detailed description of what happened]
__________________________
__________________________

AFFECTED SYSTEMS
----------------
Systems Affected: [List affected systems, accounts, or data]
Data Affected: [If applicable, describe affected data]
__________________________

IMPACT ASSESSMENT
-----------------
Potential Impact: [Describe potential impact]
Actual Impact: [Describe actual impact if known]
__________________________

INITIAL RESPONSE
----------------
Actions Taken: [List actions taken so far]
Containment Measures: [If applicable]
__________________________

EVIDENCE
--------
Logs: [Location of relevant logs]
Screenshots: [Location of screenshots]
Other Evidence: [Other relevant evidence]
__________________________

FOLLOW-UP
---------
Next Steps: [If known]
Additional Information: [Any additional relevant information]
__________________________
```

---

## 5. Post-Reporting Procedures

### 5.1 Investigation Support

After reporting, personnel may be asked to:
- Provide additional information
- Assist with investigation
- Preserve evidence
- Document additional findings

### 5.2 Evidence Preservation

- Do not delete logs or evidence
- Maintain chain of custody
- Store evidence securely
- Retain evidence per retention policy (minimum 90 days)

### 5.3 Communication

- Follow Security Contact guidance
- Do not discuss incident outside authorized channels
- Maintain confidentiality during investigation
- Coordinate with Security Contact before external communication

---

## 6. Related Documents

- Incident Response Policy (`MAC-POL-215_Incident_Response_Policy.md`)
- Incident Response Quick Card (`../06-supporting-documents/MAC-SEC-107_Incident_Response_Quick_Card.md`)
- Security Policy (`../../SECURITY.md`)

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-223-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-223-signoff.md`



---
**QMS signature (SHA-256):** `fd82313c938407759bc100716d853600a1f1bf2ea36116de1885cb58459ea483`
