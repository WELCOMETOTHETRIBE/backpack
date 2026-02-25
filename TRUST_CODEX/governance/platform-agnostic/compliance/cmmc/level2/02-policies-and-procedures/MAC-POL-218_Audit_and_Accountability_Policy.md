# Audit and Accountability Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.3

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains comprehensive audit logging and accountability capabilities to enable monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity. This policy establishes requirements for audit log creation, retention, protection, review, and management to ensure accountability for all system users and activities.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.3 (Audit and Accountability).

---

## 2. Scope

This policy applies to:
- All organizational systems that process, store, or transmit CUI
- All system components (hardware, software, firmware)
- All system users (privileged and nonprivileged)
- All system activities and events
- All audit logging systems and tools
- All audit information and records

**System Scope:** FCI and CUI environment.

---

## 3. Audit Logging Requirements

### 3.1 Create and Retain Audit Logs (3.3.1)

**Requirement:** Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.

**Implementation:**
- Audit logging system implemented via AppEvent table
- Audit logs capture authentication events, admin actions, file operations, security events, system events
- Audit logs retained for minimum 90 days
- Audit logs enable monitoring, analysis, investigation, and reporting
- Audit log retention policy: Minimum 90 days, configurable
- Retention verification process implemented
- Retention compliance verified quarterly

**Events Logged:**
- Authentication events: login, login_failed, logout
- Admin actions: user management, password resets, exports, system configuration
- File operations: upload, download, delete, access
- Security events: CUI spill detection, permission denials, unauthorized access attempts
- System events: configuration changes, physical access logs, endpoint inventory updates

**Audit Log Content:**
- Timestamp (UTC)
- User identification (user_id)
- Event type
- Event description
- Event outcome (success/failure)
- Source information
- Target information (if applicable)

**Evidence:**
- `lib/audit.ts` (audit logging implementation, retention verification)
- `prisma/schema.prisma` (AppEvent model)
- Admin audit log viewer: `/admin/events`
- Audit log export: `/api/admin/events/export`
- Audit Log Retention Evidence: `../05-evidence/MAC-RPT-107_Audit_Log_Retention_Evidence.md`

**Status:** ✅ Fully Implemented

---

### 3.2 Unique User Traceability (3.3.2)

**Requirement:** Ensure that the actions of individual system users can be uniquely traced to those users, so they can be held accountable for their actions.

**Implementation:**
- Audit logs include user identification (user_id)
- All user actions logged with user identification
- User actions uniquely traceable to individual users
- Audit logs link events to specific users
- User accountability enforced through audit logging

**Traceability Requirements:**
- All audit records include user_id
- User identification verified before action execution
- User actions cannot be performed anonymously
- User accountability maintained for all system activities

**Evidence:**
- `lib/audit.ts` (user identification in audit logs)
- `prisma/schema.prisma` (AppEvent model with user_id field)
- Audit log viewer: `/admin/events`

**Status:** ✅ Implemented

---

### 3.3 Review and Update Logged Events (3.3.3)

**Requirement:** Review and update logged events.

**Implementation:**
- Audit log review procedure established
- Periodic review of logged events conducted
- Logged event types reviewed and updated as needed
- Event logging configuration reviewed periodically
- Review schedule: Monthly minimum

**Review Process:**
- Review logged event types for relevance
- Assess if additional events should be logged
- Assess if any logged events are no longer needed
- Update event logging configuration as needed
- Document review results

**Evidence:**
- Audit Log Review Procedure: `MAC-SOP-226_Audit_Log_Review_Procedure.md`
- Audit Log Review Log: `../05-evidence/audit-log-reviews/audit-log-review-log.md`

**Status:** ✅ Fully Implemented

---

### 3.4 Alert on Audit Logging Failure (3.3.4)

**Requirement:** Alert in the event of an audit logging process failure.

**Implementation:**
- Audit logging failure detection implemented
- Alerts for audit logging failures generated via `generateFailureAlerts()` function
- Monitoring of audit logging system health
- Failure alerting mechanism established in `lib/audit.ts`
- Alert recipients: System Administrator

**Failure Types:**
- Account lockouts (critical alerts)
- Multiple failed MFA verifications (warning alerts)
- High event volume (info alerts)
- Audit logging process failures (when detected)

**Evidence:**
- Failure alerts function: `lib/audit.ts` - `generateFailureAlerts()`
- Audit and Accountability Policy: This document

**Status:** ✅ Fully Implemented

---

### 3.5 Correlate Audit Records (3.3.5)

**Requirement:** Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.

**Implementation:**
- Audit record correlation implemented via `correlateEvents()` function
- Correlation processes support investigation and response
- Audit record analysis capabilities enhanced
- Reporting processes integrated with correlation
- Correlation supports incident investigation
- Suspicious pattern detection implemented via `detectSuspiciousPatterns()` function

**Correlation Capabilities:**
- Cross-event correlation by user, IP, action type
- User activity correlation
- Time-based correlation (configurable time windows)
- Pattern detection in event details
- Anomaly identification (multiple failed logins, rapid actions, unusual IPs)

**Evidence:**
- Correlation function: `lib/audit.ts` - `correlateEvents()`
- Suspicious pattern detection: `lib/audit.ts` - `detectSuspiciousPatterns()`
- Audit Log Review Procedure: `MAC-SOP-226_Audit_Log_Review_Procedure.md`

**Status:** ✅ Fully Implemented

---

### 3.6 Audit Record Reduction and Reporting (3.3.6)

**Requirement:** Provide audit record reduction and report generation to support on-demand analysis and reporting.

**Implementation:**
- Audit record export functionality implemented (CSV export)
- Audit log filtering and search capabilities in admin portal
- Report generation via CSV export
- On-demand analysis supported through export functionality
- Custom reports can be generated from exported data

**Export Capabilities:**
- CSV export with filtering
- Date range filtering
- Event type filtering
- User filtering
- Custom report generation

**Evidence:**
- Audit log export: `/api/admin/events/export`
- Admin audit log viewer: `/admin/events`
- CSV export functionality

**Status:** ✅ Implemented

---

### 3.7 System Clock Synchronization (3.3.7)

**Requirement:** Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.

**Implementation:**
- System clock synchronization provided by hosting environment (historical) (inherited)
- Audit records include UTC timestamps
- Time synchronization managed by platform infrastructure
- Timestamps accurate and synchronized
- Time service critical for audit record accuracy

**Time Synchronization:**
- hosting environment (historical) provides NTP synchronization (inherited)
- All audit records use UTC timestamps
- Time granularity: Sufficient for audit requirements
- Clock synchronization verified by platform

**Evidence:**
- hosting environment (historical) time synchronization (inherited)
- Audit log timestamps: AppEvent.createdAt (UTC)

**Status:** 🔄 Inherited

---

### 3.8 Protect Audit Information (3.3.8)

**Requirement:** Protect audit information and audit logging tools from unauthorized access, modification, and deletion.

**Implementation:**
- Audit logs append-only (no update/delete operations)
- Audit log access restricted to ADMIN role
- Audit logging tools protected via access controls
- Audit information protected from unauthorized modification
- Database-level protection of audit records

**Protection Mechanisms:**
- Append-only design: No update or delete functions in audit system
- Access controls: Admin-only access to audit logs
- Immutability: Audit records cannot be modified after creation
- Database constraints: Prevent audit record modification
- Audit logging tools: Protected via access controls

**Evidence:**
- `lib/audit.ts` (append-only design, no update/delete functions)
- `prisma/schema.prisma` (AppEvent model - immutable)
- Admin-only access: `/admin/events`
- Access Control Policy: `MAC-POL-210_Access_Control_Policy.md`

**Status:** ✅ Implemented

---

### 3.9 Limit Audit Logging Management (3.3.9)

**Requirement:** Limit management of audit logging functionality to a subset of privileged users.

**Implementation:**
- Audit logging functionality management restricted to ADMIN role
- Audit log configuration changes require ADMIN privileges
- Audit logging management limited to authorized administrators
- Separation of audit management from other administrative functions

**Management Restrictions:**
- Only ADMIN role can access audit logs
- Only ADMIN role can configure audit logging
- Audit logging management separated from other admin functions
- Audit management privileges documented

**Evidence:**
- Admin role required for audit log access
- Audit logging configuration: Admin-only
- Access Control Policy: `MAC-POL-210_Access_Control_Policy.md`

**Status:** ✅ Implemented

---

## 4. Audit Log Retention

### 4.1 Retention Period

**Minimum Retention:** 90 days

**Retention Policy:**
- Audit logs retained for minimum 90 days
- Retention period configurable
- Retention policy documented
- Retention enforced at database level

### 4.2 Retention Management

**Retention Enforcement:**
- Database retention policy configured
- Old audit logs archived or deleted per retention policy
- Retention policy reviewed periodically
- Retention compliance verified

---

## 5. Audit Log Review

### 5.1 Review Schedule

**Review Frequency:**
- Monthly review: Minimum monthly review of audit logs
- Ad-hoc review: As needed for incident investigation
- Quarterly comprehensive review: Quarterly detailed review

### 5.2 Review Process

**Review Activities:**
- Review audit logs for suspicious activity
- Identify unauthorized access attempts
- Identify policy violations
- Identify system anomalies
- Document review findings

**Review Documentation:**
- Review results documented
- Findings tracked
- Actions taken documented
- Review schedule maintained

---

## 6. Roles and Responsibilities

### 6.1 System Administrator

**Responsibilities:**
- Maintain audit logging system
- Review audit logs regularly
- Investigate audit log anomalies
- Manage audit log retention
- Protect audit information
- Limit audit logging management access

### 6.2 Security Contact

**Responsibilities:**
- Review security-related audit events
- Investigate security incidents
- Coordinate incident response based on audit findings

### 6.3 Management

**Responsibilities:**
- Review audit log review reports
- Allocate resources for audit log management
- Approve audit log retention policies

---

## 7. Related Documents

- Audit Log Review Procedure: `MAC-SOP-226_Audit_Log_Review_Procedure.md` (to be created)
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.4)
- Access Control Policy: `MAC-POL-210_Access_Control_Policy.md`
- Incident Response Policy: `MAC-POL-215_Incident_Response_Policy.md`

---

## 8. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2

---

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.3 (Audit and Accountability)
- NIST SP 800-92 (Guide to Computer Security Log Management)
- CMMC 2.0 Level 2 Assessment Guide
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-218-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-218-signoff.md`

