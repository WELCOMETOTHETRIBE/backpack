# Plan of Action and Milestones (POA&M) Process Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.12.2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for developing, implementing, and managing Plans of Action and Milestones (POA&M) to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.

---

## 2. Scope

This procedure applies to:
- All security control deficiencies
- All vulnerabilities requiring remediation
- All POA&M items
- All personnel responsible for POA&M management

---

## 3. POA&M Process

### 3.1 POA&M Item Identification

**Sources of POA&M Items:**
- Security control assessments
- Risk assessments
- Vulnerability assessments
- Security audits
- Incident response activities
- Continuous monitoring
- Self-assessments

**POA&M Item Criteria:**
- Security control not fully implemented
- Security control partially implemented
- Vulnerability requiring remediation
- Deficiency identified in assessment
- Gap between current state and required state

---

### 3.2 POA&M Item Development

**POA&M Item Components:**
- **Deficiency Description:** Clear description of the deficiency or vulnerability
- **Affected Control:** NIST SP 800-171 requirement(s) affected
- **Planned Remediation:** Description of planned remediation actions
- **Responsible Party:** Individual or role responsible for remediation
- **Target Completion Date:** Date by which remediation should be completed
- **Resources Required:** Resources needed for remediation
- **Milestones:** Key milestones in remediation process
- **Status:** Current status (Open, In Progress, Remediated, Verified, Closed)

**POA&M Item Prioritization:**
- **High Priority:** Critical security deficiencies, high-risk vulnerabilities
- **Medium Priority:** Important deficiencies, medium-risk vulnerabilities
- **Low Priority:** Minor deficiencies, low-risk vulnerabilities

---

### 3.3 POA&M Item Tracking

**POA&M Tracking Log:**
- All POA&M items documented in POA&M Tracking Log
- POA&M items updated regularly (monthly minimum)
- Status changes documented with dates
- Remediation progress tracked

**POA&M Review:**
- POA&M items reviewed monthly
- Status updated during reviews
- Remediation progress assessed
- New POA&M items added as needed

---

### 3.4 POA&M Item Remediation

**Remediation Process:**
1. POA&M item identified and documented
2. Remediation plan developed
3. Resources allocated
4. Remediation implemented
5. Remediation verified
6. POA&M item closed

**Remediation Verification:**
- Remediation verified through testing
- Control effectiveness validated
- Evidence of remediation documented
- POA&M item status updated to "Verified"

---

### 3.5 POA&M Item Closure

**Closure Criteria:**
- Deficiency remediated
- Remediation verified
- Control operating as intended
- Evidence documented

**Closure Process:**
1. Verify remediation complete
2. Validate control effectiveness
3. Document evidence
4. Update POA&M status to "Closed"
5. Update POA&M Tracking Log

---

## 4. POA&M Tracking Log

**POA&M Tracking Log Location:**
- `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`

**POA&M Item Format:**
- POA&M ID (e.g., POAM-001)
- Deficiency description
- Affected control(s)
- Planned remediation
- Responsible party
- Target completion date
- Actual completion date
- Status
- Notes/comments

---

## 5. POA&M Management

### 5.1 POA&M Review Schedule

**Monthly Review:**
- Review all open POA&M items
- Update status and progress
- Identify any new POA&M items
- Assess remediation timelines

**Quarterly Review:**
- Comprehensive POA&M review
- Assess overall remediation progress
- Identify trends or patterns
- Report to management

**Annual Review:**
- Annual POA&M assessment
- Review all POA&M items
- Assess program effectiveness
- Update POA&M process as needed

---

### 5.2 POA&M Reporting

**Reporting Requirements:**
- POA&M status reported monthly
- POA&M status included in security assessments
- POA&M status available for assessor review
- POA&M progress tracked and documented

---

## 6. Roles and Responsibilities

### 6.1 System Administrator

**Responsibilities:**
- Maintain POA&M Tracking Log
- Review POA&M items regularly
- Update POA&M status
- Coordinate remediation activities
- Verify remediation completion

### 6.2 Responsible Parties

**Responsibilities:**
- Implement assigned POA&M remediations
- Report remediation progress
- Complete remediation by target date
- Document remediation activities

### 6.3 Management

**Responsibilities:**
- Review POA&M status
- Allocate resources for remediation
- Approve remediation timelines
- Make risk-based decisions on POA&M items

---

## 7. POA&M Item Lifecycle

**POA&M Item States:**
1. **Open:** POA&M item identified, not yet started
2. **In Progress:** Remediation activities underway
3. **Remediated:** Remediation complete, awaiting verification
4. **Verified:** Remediation verified, control operating
5. **Closed:** POA&M item closed, no further action needed

---

## 8. Related Documents

- Security Assessment Policy: `MAC-POL-224_Security_Assessment_Policy.md` (to be created)
- Risk Assessment Policy: `MAC-POL-223_Risk_Assessment_Policy.md`
- POA&M Tracking Log: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 14)

---

## 9. Document Control

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
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-231-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-231-signoff.md`

