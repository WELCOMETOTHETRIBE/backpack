# Audit Log Review Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.3.3

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for reviewing and updating logged events to ensure audit logging remains effective and relevant.

---

## 2. Scope

This procedure applies to:
- Audit log review activities
- Logged event type reviews
- Audit logging configuration reviews
- Audit log analysis

---

## 3. Audit Log Review Process

### 3.1 Review Schedule

**Monthly Review:**
- Frequency: Monthly (minimum)
- Timeline: First week of each month
- Scope: Review audit logs for suspicious activity, review logged event types

**Quarterly Review:**
- Frequency: Quarterly
- Timeline: First week of each quarter
- Scope: Comprehensive review of audit logging system, event types, and configuration

**Ad-Hoc Review:**
- Triggered by: Security incidents, suspicious activity, system changes
- Timeline: As needed
- Scope: Focused review based on trigger

---

### 3.2 Review Activities

**Step 1: Access Audit Logs**
- Access audit log viewer: `/admin/events`
- Apply filters as needed (date range, event type, user)
- Export audit logs if needed for analysis

**Step 2: Review Audit Logs for Suspicious Activity**
- Review authentication events (failed logins, unusual patterns)
- Review admin actions (unauthorized actions, privilege escalation)
- Review security events (permission denials, CUI spill detection)
- Review system events (unusual configuration changes)
- Identify anomalies or suspicious patterns

**Step 3: Review Logged Event Types**
- Assess if current logged events are sufficient
- Identify events that should be logged but are not
- Identify events that are logged but may not be needed
- Review event logging coverage

**Step 4: Document Review Findings**
- Document suspicious activity identified
- Document event type recommendations
- Document configuration recommendations
- Update review log

**Step 5: Take Action on Findings**
- Investigate suspicious activity
- Update event logging configuration if needed
- Update audit logging procedures if needed
- Report findings to management

---

### 3.3 Event Type Review

**Review Criteria:**
- Are all required events being logged?
- Are logged events relevant and useful?
- Are there gaps in event logging?
- Are there unnecessary logged events?

**Event Categories:**
- Authentication events
- Authorization events
- System access events
- Data access events
- Configuration changes
- Security events
- Administrative actions

**Review Process:**
- Review each event category
- Assess logging coverage
- Identify gaps or improvements
- Update event logging configuration

---

### 3.4 Configuration Review

**Review Areas:**
- Audit log retention settings
- Audit log access controls
- Audit log protection mechanisms
- Audit logging system performance
- Audit log storage capacity

**Review Process:**
- Review audit logging configuration
- Assess configuration effectiveness
- Identify configuration improvements
- Update configuration as needed

---

## 4. Review Documentation

### 4.1 Review Log

**Review Log Includes:**
- Review date
- Reviewer name
- Review scope
- Findings
- Actions taken
- Recommendations

**Review Log Location:**
- Documented in audit log review records
- Maintained by System Administrator

### 4.2 Review Reports

**Monthly Review Report:**
- Summary of review activities
- Suspicious activity identified
- Event type recommendations
- Configuration recommendations

**Quarterly Review Report:**
- Comprehensive review summary
- Audit logging system assessment
- Recommendations for improvements
- Action items

---

## 5. Roles and Responsibilities

**System Administrator:**
- Conduct audit log reviews
- Document review findings
- Update audit logging configuration
- Investigate suspicious activity

**Security Contact:**
- Review security-related audit events
- Investigate security incidents
- Coordinate response to findings

**Management:**
- Review audit log review reports
- Approve configuration changes
- Allocate resources for improvements

---

## 6. Related Documents

- Audit and Accountability Policy: `MAC-POL-218_Audit_and_Accountability_Policy.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.4)
- Incident Response Policy: `MAC-POL-215_Incident_Response_Policy.md`

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-226-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-226-signoff.md`

