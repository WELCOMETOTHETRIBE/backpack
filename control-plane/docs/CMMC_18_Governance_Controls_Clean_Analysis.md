# CMMC 18 Governance-Adjudicated Controls — Clean Analysis
## Exact Document Requirements Derived from NIST Control Mapping

---

## Overview

Based on the official CONTROL_MAPPING_800-171R2.md table, exactly **18 controls** are classified as **Governance / Policy (Class B)** and can be adjudicated through governance documents alone. This analysis identifies the **minimum set of documents** required to satisfy each control, with no extraneous or unnecessary documents.

---

## The 18 Governance-Adjudicated Controls

### 1. AC.L2-3.1.4 — Separate Duties

**NIST Requirement:** Separate duties among individuals to prevent malevolent activity.

**Classification:** Governance / Policy (Class B)

**Primary Governance Document Required:**
- **MAC-POL-210** — Access Control Policy

**What MAC-POL-210 Must Address for AC.L2-3.1.4:**
- Definition of separation of duties principle
- Identification of incompatible duty pairs (e.g., approver cannot implement changes)
- Policy requirement that incompatible duties are assigned to different individuals
- Monitoring procedures to detect violations
- Enforcement mechanisms

**Evidence Records Required:**
- Separation of Duties Matrix (documented role conflicts and assignments)
- Access control configuration showing enforcement
- Monitoring records showing no violations or documented remediation

**C3PAO Verification Focus:**
- Does MAC-POL-210 explicitly define incompatible duty pairs?
- Is there a documented Separation of Duties Matrix?
- Are access controls configured to prevent conflicts?
- Are there monitoring records showing compliance?

---

### 2. AT.L2-3.2.1 — Security Awareness Training

**NIST Requirement:** Provide security awareness training to all users.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-219** — Awareness and Training Policy
- **MAC-SOP-227** — Security Awareness Training Procedure

**What MAC-POL-219 Must Address for AT.L2-3.2.1:**
- Mandatory security awareness training requirement
- Training frequency (at least annually)
- Training scope (all users)
- Training topics (CUI handling, acceptable use, incident reporting)
- Approval authority and review procedures

**What MAC-SOP-227 Must Address for AT.L2-3.2.1:**
- Step-by-step training enrollment and delivery procedures
- Training curriculum outline
- Completion verification and documentation procedures
- Training records retention requirements (minimum 3 years)

**Evidence Records Required:**
- Training completion records for 100% of active users
- Training dates within past 12 months for all users
- Training attendance/completion documentation

**C3PAO Verification Focus:**
- Does MAC-POL-219 mandate annual training for all users?
- Does MAC-SOP-227 define the training delivery process?
- Do training records exist for all active users?
- Are training dates current (within 12 months)?

---

### 3. AT.L2-3.2.2 — Security Training for Significant Security Responsibilities

**NIST Requirement:** Provide security training to individuals with significant security responsibilities.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-219** — Awareness and Training Policy
- **MAC-SOP-227** — Security Awareness Training Procedure

**What MAC-POL-219 Must Address for AT.L2-3.2.2:**
- Definition of "significant security responsibilities" (e.g., system administrators, security officers, incident responders)
- Enhanced training requirements for security personnel (beyond general awareness)
- Training topics specific to each security role
- Training frequency (at least annually)
- Training must occur before assuming security responsibilities

**What MAC-SOP-227 Must Address for AT.L2-3.2.2:**
- Process for identifying individuals with significant security responsibilities
- Role-specific training curriculum for each security role
- Training delivery procedures
- Completion verification for security personnel

**Evidence Records Required:**
- Training completion records for all security personnel
- Training dates showing completion before role assignment
- Role-specific training curriculum documentation

**C3PAO Verification Focus:**
- Does MAC-POL-219 define which roles have significant security responsibilities?
- Does MAC-SOP-227 describe role-specific training?
- Do training records exist for all security personnel?
- Were security personnel trained before assuming their roles?

---

### 4. AT.L2-3.2.3 — Insider Threat Awareness Training

**NIST Requirement:** Provide insider threat awareness training to all users.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-219** — Awareness and Training Policy
- **MAC-SOP-227** — Security Awareness Training Procedure

**What MAC-POL-219 Must Address for AT.L2-3.2.3:**
- Insider threat awareness training is mandatory for all users
- Training frequency (at least annually)
- Training topics: recognizing insider threat indicators, reporting procedures, non-retaliation policy
- Emphasis on non-punitive reporting culture

**What MAC-SOP-227 Must Address for AT.L2-3.2.3:**
- Insider threat training curriculum outline
- Specific insider threat indicators covered (unusual access patterns, policy violations, behavioral changes)
- Reporting procedures for suspected insider threats
- Non-retaliation policy and multiple reporting channels
- Completion verification procedures

**Evidence Records Required:**
- Training completion records for 100% of users
- Training curriculum showing insider threat content
- Documentation of non-retaliation messaging

**C3PAO Verification Focus:**
- Does MAC-POL-219 mandate insider threat training for all users?
- Does MAC-SOP-227 include specific insider threat content?
- Is non-retaliation messaging documented?
- Do training records exist for all users?

---

### 5. AU.L2-3.3.3 — Review and Update Logged Events

**NIST Requirement:** Review and update logged events for unusual activity.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-218** — Audit and Accountability Policy
- **MAC-SOP-226** — Audit Log Review Procedure

**What MAC-POL-218 Must Address for AU.L2-3.3.3:**
- Audit logs must be reviewed for unusual activity
- Review frequency (at least monthly)
- Definition of "unusual activity" (e.g., failed login attempts, unauthorized access attempts, privilege escalation)
- Escalation procedures for suspicious activity
- Retention of review findings and actions

**What MAC-SOP-226 Must Address for AU.L2-3.3.3:**
- Step-by-step audit log review procedure
- Tools and methods for log analysis
- Search criteria for identifying unusual activity
- Documentation template for review findings
- Escalation criteria and procedures
- Investigation procedures for suspicious activity

**Evidence Records Required:**
- Monthly audit log review records (at least 12 months)
- Review findings documentation
- Actions taken based on findings
- Escalation records if suspicious activity detected

**C3PAO Verification Focus:**
- Does MAC-POL-218 mandate monthly log reviews?
- Does MAC-SOP-226 define the review procedure?
- Do monthly review records exist for past 12 months?
- Are findings and actions documented?

---

### 6. CM.L2-3.4.3 — Change Control

**NIST Requirement:** Approve and control changes to the system.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-220** — Configuration Management Policy

**What MAC-POL-220 Must Address for CM.L2-3.4.3:**
- All changes must be approved before implementation
- Change approval process (request, review, approval, implementation, verification)
- Approval authority
- Change documentation requirements
- Unauthorized changes are prohibited

**Evidence Records Required:**
- Change approval records for all changes (past 6-12 months)
- Each change record showing: request, approval, implementation, verification
- Documentation of unauthorized changes (if any) and remediation

**C3PAO Verification Focus:**
- Does MAC-POL-220 require change approval?
- Do change approval records exist?
- Are all changes approved before implementation?
- Are unauthorized changes detected and remediated?

---

### 7. CM.L2-3.4.4 — Security Impact Analysis

**NIST Requirement:** Perform security impact analysis for changes.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-220** — Configuration Management Policy
- **MAC-SOP-225** — Configuration Change Procedure

**What MAC-POL-220 Must Address for CM.L2-3.4.4:**
- Security impact analysis is required for all changes
- Impact analysis must be documented
- High-risk changes require additional review

**What MAC-SOP-225 Must Address for CM.L2-3.4.4:**
- Step-by-step security impact analysis procedure
- Risk assessment methodology
- Documentation template for impact analysis
- Approval procedures based on risk level

**Evidence Records Required:**
- Security impact analysis documentation for changes
- Risk assessment results
- Approval records based on impact analysis

**C3PAO Verification Focus:**
- Does MAC-POL-220 require security impact analysis?
- Does MAC-SOP-225 define the analysis procedure?
- Do impact analysis records exist for changes?
- Are high-risk changes identified and escalated?

---

### 8. IR.L2-3.6.1 — Operational Incident-Handling Capability

**NIST Requirement:** Establish incident response capability.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-215** — Incident Response Policy

**What MAC-POL-215 Must Address for IR.L2-3.6.1:**
- Incident response capability is established and documented
- Incident response team structure and roles
- Incident response team members identified
- Incident classification and severity levels
- Incident response procedures for each phase (detection, analysis, containment, eradication, recovery)
- Escalation procedures
- Approval authority

**Evidence Records Required:**
- Incident response team roster with members and contact information
- Incident classification criteria
- Incident response procedures documentation
- Escalation procedures

**C3PAO Verification Focus:**
- Is an incident response team formally designated?
- Are team members identified and trained?
- Are incident classification criteria defined?
- Are incident response procedures documented?

---

### 9. IR.L2-3.6.2 — Track, Document, and Report Incidents

**NIST Requirement:** Track, document, and report incidents.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-215** — Incident Response Policy

**What MAC-POL-215 Must Address for IR.L2-3.6.2:**
- Incident reporting requirements and procedures
- Incident documentation requirements
- Incident tracking procedures
- Incident reporting procedures (who to notify, when, what information)
- Retention of incident records

**Evidence Records Required:**
- Incident records (at least one from past 12 months)
- Incident documentation showing: date, description, investigation, actions, resolution
- Incident tracking records

**C3PAO Verification Focus:**
- Does MAC-POL-215 require incident documentation?
- Do incident records exist?
- Are incidents tracked and reported?
- Is incident documentation complete?

---

### 10. IR.L2-3.6.3 — Test Incident Response Capability

**NIST Requirement:** Test incident response capability.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-215** — Incident Response Policy
- **MAC-SOP-232** — Incident Response Testing Procedure

**What MAC-POL-215 Must Address for IR.L2-3.6.3:**
- Incident response testing is mandatory
- Testing frequency (at least annually)
- Testing scope (all incident response procedures)

**What MAC-SOP-232 Must Address for IR.L2-3.6.3:**
- Testing frequency and schedule
- Testing scenarios (detailed descriptions)
- Testing procedures (step-by-step)
- Success criteria and evaluation procedures
- Documentation template
- Lessons learned process

**Evidence Records Required:**
- Annual incident response test records
- Test scenarios and results
- Lessons learned documentation
- Improvements implemented

**C3PAO Verification Focus:**
- Does MAC-POL-215 mandate annual testing?
- Does MAC-SOP-232 define testing procedures?
- Do test records exist for past 12 months?
- Are lessons learned documented?

---

### 11. MA.L2-3.7.6 — Supervise Maintenance Personnel

**NIST Requirement:** Supervise maintenance personnel.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-221** — Maintenance Policy

**What MAC-POL-221 Must Address for MA.L2-3.7.6:**
- Maintenance personnel supervision is required
- Supervision procedures for third-party maintenance
- Monitoring procedures for maintenance activities
- Documentation requirements
- Escalation procedures for unauthorized activities

**Evidence Records Required:**
- Maintenance supervision records
- Monitoring logs showing supervision
- Documentation of any unauthorized activities and remediation

**C3PAO Verification Focus:**
- Does MAC-POL-221 require supervision of maintenance personnel?
- Are supervision procedures documented?
- Do supervision records exist?
- Are maintenance activities monitored?

---

### 12. PS.L2-3.9.1 — Screen Individuals Prior to Access

**NIST Requirement:** Screen individuals before authorizing access.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-222** — Personnel Security Policy
- **MAC-SOP-233** — Personnel Screening Procedure

**What MAC-POL-222 Must Address for PS.L2-3.9.1:**
- All individuals must be screened before access authorization
- Screening requirements (background check, reference checks, identity verification)
- Screening scope and methodology
- Screening approval authority
- Screening records retention (minimum 3 years)

**What MAC-SOP-233 Must Address for PS.L2-3.9.1:**
- Screening process and procedures
- Background check requirements
- Reference check procedures
- Identity verification procedures
- Screening documentation template
- Approval procedures

**Evidence Records Required:**
- Screening records for all active users
- Screening completion before access authorization
- Background check documentation

**C3PAO Verification Focus:**
- Does MAC-POL-222 require screening?
- Does MAC-SOP-233 define the screening process?
- Do screening records exist for all users?
- Was screening completed before access granted?

---

### 13. PS.L2-3.9.2 — Protect Systems During/After Personnel Actions

**NIST Requirement:** Protect systems during and after personnel actions (termination, role change).

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-222** — Personnel Security Policy

**What MAC-POL-222 Must Address for PS.L2-3.9.2:**
- Access must be terminated upon employee termination or role change
- Termination timeframe (within 24 hours)
- Termination procedures (access revocation, equipment return, data backup)
- Termination approval authority
- Termination documentation requirements

**Evidence Records Required:**
- Termination records for all separated employees (past 12 months)
- Access revocation records showing 24-hour timeframe
- Equipment return documentation
- Data backup/preservation documentation

**C3PAO Verification Focus:**
- Does MAC-POL-222 require timely access termination?
- Do termination records exist?
- Is access revoked within 24 hours?
- Are all systems revoked (network, email, applications, physical)?

---

### 14. RA.L2-3.11.1 — Periodically Assess Risk

**NIST Requirement:** Conduct risk assessments.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-223** — Risk Assessment Policy

**What MAC-POL-223 Must Address for RA.L2-3.11.1:**
- Risk assessments are mandatory
- Risk assessment frequency (at least annually)
- Risk assessment scope (all systems, applications, data)
- Risk assessment methodology (NIST SP 800-30 or equivalent)
- Risk assessment roles and responsibilities
- Risk assessment approval authority
- Risk assessment documentation requirements

**Evidence Records Required:**
- Annual risk assessment documentation
- Risk assessment methodology
- Identified risks with ratings
- Mitigation recommendations
- Risk assessment approval

**C3PAO Verification Focus:**
- Does MAC-POL-223 mandate annual risk assessments?
- Do risk assessment records exist?
- Is the methodology documented?
- Are risks identified and prioritized?

---

### 15. CA.L2-3.12.1 — Periodically Assess Security Controls

**NIST Requirement:** Periodically assess security controls.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-224** — Security Assessment Policy

**What MAC-POL-224 Must Address for CA.L2-3.12.1:**
- Security control assessments are mandatory
- Assessment frequency (at least annually)
- Assessment scope (all 110 controls)
- Assessment methodology
- Assessment approval authority
- Assessment documentation requirements

**Evidence Records Required:**
- Annual security control assessment documentation
- Assessment results for each control
- Control effectiveness ratings
- Findings and recommendations
- Assessment approval

**C3PAO Verification Focus:**
- Does MAC-POL-224 mandate annual assessments?
- Do assessment records exist?
- Are all 110 controls assessed?
- Are findings documented?

---

### 16. CA.L2-3.12.2 — Develop and Implement Plan of Action & Milestones (POA&M)

**NIST Requirement:** Develop and implement POA&M.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-224** — Security Assessment Policy

**What MAC-POL-224 Must Address for CA.L2-3.12.2:**
- POA&M development is required for all findings
- POA&M content requirements (finding description, remediation plan, timeline, responsible party)
- POA&M tracking and monitoring procedures
- POA&M approval authority
- POA&M documentation and retention requirements

**Evidence Records Required:**
- POA&M documentation for all findings
- Tracking records showing progress
- Closure documentation for remediated findings

**C3PAO Verification Focus:**
- Does MAC-POL-224 require POA&M development?
- Do POA&M records exist?
- Are findings tracked and remediated?
- Is progress documented?

---

### 17. CA.L2-3.12.3 — Monitor Security Controls

**NIST Requirement:** Monitor security controls.

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-224** — Security Assessment Policy

**What MAC-POL-224 Must Address for CA.L2-3.12.3:**
- Continuous security control monitoring is required
- Monitoring frequency (at least quarterly)
- Monitoring scope (all controls)
- Monitoring procedures and tools
- Monitoring results documentation
- Escalation procedures for non-compliance

**Evidence Records Required:**
- Quarterly monitoring records (at least 4 per year)
- Control status tracking
- Monitoring findings and actions
- Escalation records

**C3PAO Verification Focus:**
- Does MAC-POL-224 require quarterly monitoring?
- Do monitoring records exist?
- Are all controls monitored?
- Are findings documented and escalated?

---

### 18. CA.L2-3.12.4 — Develop/Update System Security Plan

**NIST Requirement:** Develop and update System Security Plan (SSP).

**Classification:** Governance / Policy (Class B)

**Primary Governance Documents Required:**
- **MAC-POL-224** — Security Assessment Policy

**What MAC-POL-224 Must Address for CA.L2-3.12.4:**
- System Security Plan is mandatory
- SSP must be developed before system authorization
- SSP must be reviewed and updated annually
- SSP must be approved by management/CISO
- SSP must be protected and controlled

**Evidence Records Required:**
- Complete System Security Plan document
- SSP covering all 110 controls
- SSP approval signatures
- Annual review/update records

**C3PAO Verification Focus:**
- Does a complete SSP exist?
- Does it cover all 110 controls?
- Is it approved by management/CISO?
- Has it been reviewed annually?

---

## Summary: Minimum Document Set for 18 Governance Controls

The **minimum set of governance documents** required to adjudicate all 18 controls is:

| Policy Document | Procedure Document | Controls Supported |
|---|---|---|
| MAC-POL-210 (Access Control) | — | AC.L2-3.1.4 (Separate Duties) |
| MAC-POL-215 (Incident Response) | MAC-SOP-232 (IR Testing) | IR.L2-3.6.1, 3.6.2, 3.6.3 |
| MAC-POL-218 (Audit & Accountability) | MAC-SOP-226 (Log Review) | AU.L2-3.3.3 |
| MAC-POL-219 (Awareness & Training) | MAC-SOP-227 (Training) | AT.L2-3.2.1, 3.2.2, 3.2.3 |
| MAC-POL-220 (Configuration Management) | MAC-SOP-225 (Change Procedure) | CM.L2-3.4.3, 3.4.4 |
| MAC-POL-221 (Maintenance) | — | MA.L2-3.7.6 |
| MAC-POL-222 (Personnel Security) | MAC-SOP-233 (Screening) | PS.L2-3.9.1, 3.9.2 |
| MAC-POL-223 (Risk Assessment) | — | RA.L2-3.11.1 |
| MAC-POL-224 (Security Assessment) | — | CA.L2-3.12.1, 3.12.2, 3.12.3, 3.12.4 |

**Total: 9 Policy Documents + 4 Procedure Documents = 13 Core Documents**

---

## Key Principles for True Compliance

1. **Documents Must Be Specific** — Generic policies are insufficient. Each policy must explicitly address the control requirement and define procedures.

2. **Procedures Must Be Detailed** — Procedures must provide step-by-step guidance that can be followed consistently.

3. **Evidence Records Are Essential** — The policy and procedure alone do NOT satisfy the control. Evidence records demonstrating compliance are required:
   - Training records for AT controls
   - Review records for AU controls
   - Change records for CM controls
   - Incident records for IR controls
   - Screening/termination records for PS controls
   - Risk assessment records for RA controls
   - Assessment/monitoring records for CA controls

4. **Approval and Authority** — Each policy must define approval authority and require documented approval.

5. **Retention Requirements** — Policies must specify how long records are retained (typically 3+ years).

6. **Regular Review and Update** — Policies must be reviewed and updated at least annually.

---

## What NOT to Include

Based on the control mapping table, the following are **NOT required** for the 18 governance controls:

- System architecture documents (MAC-IT-301)
- System Security Plan (MAC-IT-304) — This is evidence of CA.L2-3.12.4, not a governance document
- Evidence reports (MAC-RPT-*) — These are evidence records, not governance documents
- Supporting guides or quick cards — These are helpful but not required
- Forms or templates — These are supporting materials, not core governance documents

---

## Implementation Checklist

To achieve compliance with the 18 governance-adjudicated controls:

- [ ] Create MAC-POL-210 (Access Control Policy) with separation of duties requirements
- [ ] Create MAC-POL-215 (Incident Response Policy) with IR procedures and testing requirements
- [ ] Create MAC-POL-218 (Audit & Accountability Policy) with log review requirements
- [ ] Create MAC-POL-219 (Awareness & Training Policy) with training requirements
- [ ] Create MAC-POL-220 (Configuration Management Policy) with change control requirements
- [ ] Create MAC-POL-221 (Maintenance Policy) with maintenance supervision requirements
- [ ] Create MAC-POL-222 (Personnel Security Policy) with screening and termination requirements
- [ ] Create MAC-POL-223 (Risk Assessment Policy) with risk assessment requirements
- [ ] Create MAC-POL-224 (Security Assessment Policy) with assessment and monitoring requirements
- [ ] Create MAC-SOP-225 (Change Procedure) with security impact analysis procedures
- [ ] Create MAC-SOP-226 (Log Review Procedure) with audit log review procedures
- [ ] Create MAC-SOP-227 (Training Procedure) with training delivery procedures
- [ ] Create MAC-SOP-232 (IR Testing Procedure) with incident response testing procedures
- [ ] Create MAC-SOP-233 (Screening Procedure) with personnel screening procedures
- [ ] Establish processes to generate and maintain evidence records for each control
- [ ] Conduct annual review and update of all policies and procedures
- [ ] Obtain management/CISO approval for all policies

---

## Conclusion

The 18 governance-adjudicated controls require **13 core governance documents** (9 policies + 4 procedures) plus **ongoing evidence records** demonstrating that the policies are being followed. The key to compliance is not just having the documents, but having complete, detailed, specific documents that are actively implemented and supported by evidence records.
