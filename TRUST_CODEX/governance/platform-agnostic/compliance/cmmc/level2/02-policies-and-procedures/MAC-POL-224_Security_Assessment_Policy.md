# Security Assessment Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.12

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains a security assessment program to periodically assess security controls, develop and implement Plans of Action and Milestones (POA&M), monitor security controls on an ongoing basis, and develop and maintain system security plans.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.12 (Security Assessment).

---

## 2. Scope

This policy applies to:
- All security control assessments
- All POA&M activities
- All continuous monitoring activities
- All system security plan development and maintenance

**System Scope:** FCI and CUI environment.

---

## 3. Security Assessment Requirements

### 3.1 Periodic Security Control Assessment (3.12.1)

**Requirement:** Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.

**Implementation:**
- Security control assessment process established
- Annual self-assessment conducted
- Security controls assessed for effectiveness
- Assessment results documented
- Control effectiveness determined through assessment

**Assessment Frequency:**
- Annual assessment: Required annually (Q1 recommended)
- Ad-hoc assessment: As needed for system changes or incidents
- Assessment schedule documented and maintained

**Assessment Process:**
- Review all 110 NIST SP 800-171 controls
- Assess control implementation status
- Assess control effectiveness
- Document assessment results
- Identify deficiencies

**Evidence:**
- Security Control Assessment Report: `../04-self-assessment/MAC-AUD-406_Security_Control_Assessment_Report.md` (to be created)
- Internal Cybersecurity Self-Assessment: `../04-self-assessment/MAC-AUD-401_Internal_Cybersecurity_Self-Assessment.md`

**Status:** ⚠️ Partially Satisfied (formal assessment process to be enhanced)

---

### 3.2 Plan of Action and Milestones (POA&M) (3.12.2)

**Requirement:** Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.

**Implementation:**
- POA&M process established
- POA&M tracking document maintained
- Deficiencies tracked in POA&M
- POA&M items prioritized and remediated
- POA&M process documented

**POA&M Management:**
- POA&M items identified during assessments
- POA&M items tracked in POA&M Tracking Log
- POA&M items reviewed regularly
- POA&M remediation progress monitored

**Evidence:**
- POA&M Process Procedure: `MAC-SOP-231_POA&M_Process_Procedure.md`
- POA&M Tracking Log: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`

**Status:** ✅ Implemented

---

### 3.3 Continuous Monitoring (3.12.3)

**Requirement:** Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.

**Implementation:**
- Continuous monitoring process to be established
- Security controls monitored on ongoing basis
- Monitoring procedures documented
- Control effectiveness verified through monitoring

**Monitoring Activities:**
- Audit log review
- Vulnerability scanning
- Security alert monitoring
- System performance monitoring
- Access control monitoring

**Evidence:**
- Continuous Monitoring Log: `../04-self-assessment/MAC-AUD-407_Continuous_Monitoring_Log.md` (to be created)
- Continuous Monitoring Procedure: To be created

**Status:** ⚠️ Partially Satisfied (formal continuous monitoring to be established)

---

### 3.4 System Security Plan (3.12.4)

**Requirement:** Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.

**Implementation:**
- System Security Plan (SSP) developed and maintained
- SSP describes system boundaries (Section 2)
- SSP describes system environment (Section 1, 2)
- SSP describes security requirement implementation (Section 7)
- SSP describes system interconnections (Section 4)
- SSP updated periodically and as system changes

**SSP Update Process:**
- SSP updated annually (minimum)
- SSP updated when significant system changes occur
- SSP updates documented in change history
- SSP version control maintained

**Evidence:**
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md`
- SSP version control: Document control section

**Status:** ✅ Implemented

---

## 4. Assessment Process

### 4.1 Assessment Planning

**Assessment Preparation:**
- Define assessment scope
- Identify assessment team
- Schedule assessment activities
- Gather assessment materials

**Assessment Execution:**
- Review security controls
- Assess control implementation
- Assess control effectiveness
- Document assessment findings

**Assessment Reporting:**
- Document assessment results
- Identify deficiencies
- Create POA&M items
- Report to management

---

### 4.2 Assessment Documentation

**Assessment Reports Include:**
- Assessment date and scope
- Control implementation status
- Control effectiveness assessment
- Identified deficiencies
- POA&M items
- Recommendations

---

## 5. Roles and Responsibilities

### 5.1 System Administrator

**Responsibilities:**
- Conduct security control assessments
- Maintain POA&M tracking
- Perform continuous monitoring
- Update System Security Plan
- Document assessment results

### 5.2 Management

**Responsibilities:**
- Review assessment results
- Approve POA&M items
- Allocate resources for remediation
- Review System Security Plan updates

---

## 6. Related Documents

- POA&M Process Procedure: `MAC-SOP-231_POA&M_Process_Procedure.md`
- POA&M Tracking Log: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md`
- Security Control Assessment Report: `../04-self-assessment/MAC-AUD-406_Security_Control_Assessment_Report.md` (to be created)

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

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.12 (Security Assessment)
- NIST SP 800-53A (Assessing Security and Privacy Controls)
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
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-224-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-224-signoff.md`

