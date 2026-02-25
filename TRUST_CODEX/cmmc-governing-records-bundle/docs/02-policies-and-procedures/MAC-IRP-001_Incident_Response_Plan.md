# Incident Response Plan (IRP) - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.6.1

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This Incident Response Plan (IRP) establishes the operational incident-handling capability for the MacTech Solutions system, including preparation, detection, analysis, containment, recovery, and user response activities.

---

## 2. Scope

This plan applies to:
- All security incidents affecting the system
- All CUI spillage incidents
- All unauthorized access incidents
- All system compromise incidents
- All policy violation incidents

---

## 3. Incident Response Capability

### 3.1 Preparation

**Incident Response Team:**
- Security Contact: security@mactechsolutions.com
- System Administrator: [System Administrator]
- Management: [Management Contact]

**Incident Response Resources:**
- Incident Response Policy: `MAC-POL-215_Incident_Response_Policy.md`
- Incident Identification and Reporting Procedure: `MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md`
- Audit logging system for incident investigation
- System monitoring capabilities

**Training:**
- Incident response team trained on procedures
- Incident response procedures documented
- Incident response testing conducted

---

### 3.2 Detection

**Detection Methods:**
- Audit log monitoring
- Security event alerts
- User reports
- System monitoring
- Automated detection mechanisms

**Detection Sources:**
- Audit logs (`lib/audit.ts`, `/admin/events`)
- Failed login attempts
- Unauthorized access attempts
- CUI spillage detection
- System anomalies

---

### 3.3 Analysis

**Analysis Process:**
1. Review audit logs
2. Identify incident type and severity
3. Assess impact on system and CUI
4. Determine root cause
5. Document findings

**Analysis Tools:**
- Audit log viewer: `/admin/events`
- Audit log export: `/api/admin/events/export`
- System logs
- Database records

---

### 3.4 Containment

**Containment Actions:**
- Isolate affected systems or accounts
- Disable compromised accounts
- Block unauthorized access
- Preserve evidence
- Prevent further damage

**Containment Procedures:**
- Account disablement: Via admin interface
- Access blocking: Via middleware and access controls
- Evidence preservation: Audit logs, system state
- Communication: Notify relevant parties

---

### 3.5 Recovery

**Recovery Process:**
1. Remove threat or vulnerability
2. Restore system to secure state
3. Verify system functionality
4. Restore affected accounts (if applicable)
5. Monitor for recurrence

**Recovery Actions:**
- Account re-enablement (if appropriate)
- Password resets
- System configuration restoration
- Security control verification
- System functionality testing

---

### 3.6 User Response

**User Response Activities:**
- Incident notification to users (if applicable)
- User guidance on incident response
- User account remediation
- User training on incident prevention
- Post-incident communication

**User Communication:**
- Incident notifications (if user data affected)
- Security reminders
- Policy updates
- Training updates

---

## 4. Incident Types and Response

### 4.1 Security Incidents

**Types:**
- Unauthorized access
- Account compromise
- System compromise
- Malware infection
- Denial of service

**Response:**
- Immediate containment
- Investigation and analysis
- Recovery actions
- Documentation and reporting

---

### 4.2 CUI Spillage Incidents

**Types:**
- Unauthorized CUI disclosure
- CUI in unauthorized location
- CUI transmission to unauthorized party

**Response:**
- Immediate containment
- CUI removal or protection
- Impact assessment
- Notification (if required)
- Documentation and reporting

---

### 4.3 Policy Violation Incidents

**Types:**
- Access control violations
- Password policy violations
- CUI handling violations
- Security procedure violations

**Response:**
- Violation investigation
- Corrective actions
- Policy enforcement
- Documentation and reporting

---

## 5. Incident Reporting

### 5.1 Internal Reporting

**Reporting Channels:**
- Security Contact: security@mactechsolutions.com
- System Administrator
- Management

**Reporting Requirements:**
- Immediate reporting for critical incidents
- Timely reporting for all incidents
- Complete incident details
- Incident documentation

---

### 5.2 External Reporting

**External Reporting:**
- Required reporting per contracts or regulations
- Reporting to authorities (if required)
- Reporting to customers (if required)
- Reporting timelines per requirements

---

## 6. Incident Documentation

### 6.1 Incident Records

**Documentation Requirements:**
- Incident date and time
- Incident type and severity
- Incident description
- Impact assessment
- Response actions taken
- Recovery actions taken
- Lessons learned

**Documentation Location:**
- Incident records maintained by Security Contact
- Incident documentation stored securely
- Incident records available for review

---

## 7. Incident Response Testing

### 7.1 Testing Requirements

**Testing Frequency:**
- Annual tabletop exercises
- Incident response testing
- Testing results documented
- Procedures updated based on testing

**Testing Procedures:**
- Incident Response Testing Procedure: `MAC-SOP-232_Incident_Response_Testing_Procedure.md`
- Tabletop exercises
- Simulation exercises (if applicable)

---

## 8. Related Documents

- Incident Response Policy: `MAC-POL-215_Incident_Response_Policy.md`
- Incident Identification and Reporting Procedure: `MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md`
- Incident Response Testing Procedure: `MAC-SOP-232_Incident_Response_Testing_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.9, 3.6.1)

---

## 9. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*
**Next Review Date:** 2026-04-23

**Change History:**
- Version 1.0 (2026-01-23): Initial IRP creation for CMMC Level 2

---

## Appendix: Incident Response Contacts

**Security Contact:**
- Email: security@mactechsolutions.com
- Role: Primary incident response contact

**System Administrator:**
- Contact: [System Administrator Contact]
- Role: Technical incident response

**Management:**
- Contact: [Management Contact]
- Role: Management oversight
