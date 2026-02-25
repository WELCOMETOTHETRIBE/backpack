# Incident Response Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.6

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains an operational incident-handling capability to identify, report, and respond to security incidents affecting Federal Contract Information (FCI), Controlled Unclassified Information (CUI), and system resources. This policy establishes requirements for incident identification, reporting, response procedures, and incident response testing.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.6 (Incident Response).

**Level 1 Continuity:** All Level 1 FCI protection requirements remain in effect and are preserved in this policy.

---

## 2. Scope

This policy applies to:
- All security incidents involving FCI and CUI
- System security events
- Unauthorized access attempts
- Data breaches or suspected breaches
- Malware infections
- System availability issues affecting FCI and CUI
- All incident response activities including preparation, detection, analysis, containment, recovery, and user response

**System Scope:** FCI and CUI environment.

---

## 3. Incident Categories

### 3.1 Security Incidents

**Unauthorized Access:**
- Successful or attempted unauthorized access to system
- Privilege escalation attempts
- Account compromise

**Data Security:**
- Unauthorized disclosure of FCI or CUI
- Data loss or corruption
- Suspicious data access patterns
- CUI spillage or mishandling

**System Integrity:**
- Malware infections
- Unauthorized system modifications
- Denial of service attacks

**Physical Security:**
- Unauthorized physical access to systems or facilities
- Theft or loss of devices containing system access

---

## 4. Incident Identification

### 4.1 Detection Methods

Incidents may be identified through:
- Application event logs (AppEvent table)
- Authentication failure logs
- System monitoring alerts
- User reports
- Security scanning results
- External notifications

### 4.2 Indicators of Compromise

Common indicators include:
- Multiple failed login attempts
- Unusual access patterns
- Unauthorized administrative actions
- System performance degradation
- Unexpected system changes

---

## 5. Incident Reporting

### 5.1 Reporting Requirements

**Immediate Reporting Required For:**
- Suspected or confirmed data breach
- Unauthorized access to FCI
- System compromise
- Malware infections

**Reporting Timeline:**
- **Critical Incidents**: Immediately (within 1 hour)
- **High Severity**: Within 4 hours
- **Medium Severity**: Within 24 hours
- **Low Severity**: Within 72 hours

### 5.2 Reporting Channels

**Internal Reporting (Required for All Incidents):**

**Primary Contact:**
- Email: security@mactechsolutions.com (or designated security contact)
- Phone: [Designated escalation phone number]

**Alternative Contact:**
- Development team lead
- System administrator

**Decision Authority:**
- The Security Contact (or designated role) determines if external notification is required
- External notification decisions are based on incident severity and contractual obligations
- CMMC Level 2 does not require DoD or customer notification unless contractually required

### 5.3 Report Contents

Incident reports should include:
1. **Incident Description**: What happened
2. **Discovery Time**: When was the incident discovered
3. **Affected Systems**: Which systems or data are affected
4. **Impact Assessment**: Potential or actual impact
5. **Initial Response**: Actions taken so far
6. **Evidence**: Logs, screenshots, or other evidence

---

## 6. Incident Response Procedures

### 6.1 Initial Response

1. **Contain**: Isolate affected systems or accounts
2. **Document**: Record all details and evidence
3. **Report**: Notify security contact immediately
4. **Preserve**: Maintain logs and evidence

### 6.2 Investigation

1. **Gather Evidence**: Collect logs, screenshots, system state
2. **Analyze**: Determine scope and impact
3. **Identify Root Cause**: Determine how incident occurred
4. **Assess Impact**: Evaluate data and system impact

### 6.3 Remediation

1. **Eliminate Threat**: Remove malware, close access vectors
2. **Restore Systems**: Restore from backups if needed
3. **Patch Vulnerabilities**: Address root cause
4. **Verify**: Confirm systems are secure

### 6.4 Recovery

1. **Restore Operations**: Return systems to normal operation
2. **Monitor**: Enhanced monitoring for recurrence
3. **Document**: Complete incident report
4. **Review**: Lessons learned and process improvements

---

## 7. Incident Documentation

### 7.1 Incident Log

All incidents must be documented with:
- Incident ID (unique identifier)
- Discovery date and time
- Incident type and category
- Affected systems or data
- Response actions taken
- Resolution date and time
- Lessons learned

### 7.2 Evidence Preservation

- Preserve logs and evidence for investigation
- Maintain chain of custody for evidence
- Store evidence securely
- Retain evidence per retention policy (minimum 90 days)

---

## 8. Communication

### 8.1 Internal Communication

- Notify security team immediately
- Keep management informed of critical incidents
- Document all communications

### 8.2 External Communication

**Level 1 Scope Clarification:**
- CMMC Level 2 does not require DoD or customer notification unless contractually required
- External notification decisions are made by the Security Contact based on incident severity and contractual obligations
- If external notification is required (per contract), coordinate with affected parties
- Follow legal and contractual obligations
- Maintain confidentiality during investigation

---

## 9. Post-Incident Activities

### 9.1 Lessons Learned

- Review incident response effectiveness
- Identify process improvements
- Update procedures if needed
- Share knowledge with team

### 9.2 Preventive Measures

- Implement additional controls if needed
- Update security configurations
- Enhance monitoring
- Provide additional training if needed

---

## 10. Responsibilities

### 10.1 Security Contact

- Receive and triage incident reports
- Coordinate incident response
- Maintain incident documentation
- Escalate as needed

### 10.2 System Administrators

- Detect and report incidents
- Assist with investigation
- Implement containment measures
- Restore systems

### 10.3 All Personnel

- Report suspicious activity immediately
- Follow incident response procedures
- Preserve evidence
- Cooperate with investigation

---

## 11. Incident Response Testing (3.6.3)

**Requirement:** Test the organizational incident response capability.

**Implementation:**
- Incident response testing procedure established
- IR capability testing conducted (tabletop exercises, simulations)
- Testing schedule defined (annually minimum)
- Test results documented and used to improve IR capability

**Testing Methods:**
- Tabletop exercises
- Simulation exercises
- Checklist reviews
- Walk-through exercises

**Testing Schedule:**
- Annual testing: Required annually
- Ad-hoc testing: After significant system changes or incidents
- Testing frequency: Documented in IR testing procedure

**Evidence:**
- Incident Response Testing Procedure: `MAC-SOP-232_Incident_Response_Testing_Procedure.md` (to be created)
- IR test results: To be documented

**Status:** ❌ Not Implemented (POA&M item - Phase 6)

---

## 12. Incident Response Plan (IRP)

**IRP Formalization:**
- Incident Response Plan to be formalized as comprehensive document
- IRP includes: preparation, detection, analysis, containment, recovery, user response
- IRP covers FCI and CUI incident handling
- IRP reviewed and updated periodically

**IRP Components:**
- Incident response team roles and responsibilities
- Incident categories and severity levels
- Incident response procedures
- Communication procedures
- Recovery procedures
- Post-incident activities

**Evidence:**
- Incident Response Plan: To be formalized
- IRP version control: Documented

**Status:** ⚠️ Partially Satisfied (IRP to be formalized per Phase 6)

---

## 13. Compliance

### 13.1 Level 1 Requirements (FCI)
- ✅ Incident-handling capability (3.6.1) - Enhanced for Level 2
- ✅ Track, document, and report incidents (3.6.2)

### 13.2 Level 2 Requirements (CUI)
- ⚠️ Operational incident-handling capability (3.6.1) - IRP to be formalized
- ✅ Track, document, and report incidents (3.6.2)
- ❌ Test incident response capability (3.6.3) - To be implemented

**Evidence:**
- Incident response policy (this document)
- Incident response quick card
- Security contact information
- Incident log (if incidents occur)
- IR testing results: To be documented

---

## 12. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.0 (2026-01-23): **MAJOR UPGRADE - CMMC Level 2 to Level 2**
  - Upgraded from CMMC Level 2 to Level 2
  - Added CUI incident handling requirements
  - Added incident response testing requirements (3.6.3)
  - Enhanced incident-handling capability requirements (3.6.1)
  - Updated scope to include CUI
  - Preserved all Level 1 FCI requirements
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

## Appendix A: Related Documents

- Incident Response Quick Card (`../06-supporting-documents/MAC-SEC-107_Incident_Response_Quick_Card.md`)
- Security Policy (`../../SECURITY.md`)
- Event Logging (`../04-self-assessment/MAC-AUD-401_Internal_Cybersecurity_Self-Assessment.md`)

---

## Appendix B: Contact Information

**Security Contact:**
- Email: security@mactechsolutions.com
- Phone: ________________________
- Escalation: ________________________

**Emergency Contact:**
- ________________________  
*(Complete with actual contacts at release.)*
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-215-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-215-signoff.md`

