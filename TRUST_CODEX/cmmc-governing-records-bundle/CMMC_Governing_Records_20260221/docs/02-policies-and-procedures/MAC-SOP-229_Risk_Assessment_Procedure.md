# Risk Assessment Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.11.1

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for conducting risk assessments of organizational systems that process, store, or transmit CUI. Risk assessments identify, assess, and document risks to organizational operations, assets, and individuals.

---

## 2. Scope

This procedure applies to:
- Annual risk assessments
- Ad-hoc risk assessments (system changes, new threats)
- Risk assessment documentation and reporting

---

## 3. Risk Assessment Process

### 3.1 Preparation

**Step 1: Define Assessment Scope**
- Identify systems and components to be assessed
- Define system boundaries
- Identify CUI data types and flows
- Document assessment scope

**Step 2: Gather Information**
- Review system documentation (SSP, architecture diagrams)
- Review previous risk assessments
- Review vulnerability scanning results
- Review incident reports
- Review security control assessments

**Step 3: Identify Assessment Team**
- Assign risk assessment lead
- Identify subject matter experts
- Schedule assessment activities

---

### 3.2 Risk Assessment Execution

**Step 4: Identify Threats**
- Identify threat sources (external, internal)
- Identify threat events
- Document threat scenarios
- Consider threat intelligence

**Step 5: Identify Vulnerabilities**
- Review system architecture for vulnerabilities
- Review vulnerability scanning results
- Review security control gaps
- Identify configuration weaknesses
- Document vulnerabilities

**Step 6: Assess Likelihood**
- Assess likelihood of threat events
- Consider threat capability and intent
- Consider vulnerability exploitability
- Document likelihood assessments

**Step 7: Assess Impact**
- Assess impact on organizational operations
- Assess impact on organizational assets
- Assess impact on individuals
- Consider confidentiality, integrity, availability impacts
- Document impact assessments

**Step 8: Determine Risk Levels**
- Calculate risk levels (likelihood × impact)
- Categorize risks (High, Medium, Low)
- Prioritize risks
- Document risk determinations

---

### 3.3 Risk Response Planning

**Step 9: Develop Risk Response Recommendations**
- Identify risk response options (mitigate, transfer, accept, avoid)
- Develop risk mitigation recommendations
- Prioritize risk responses
- Document risk response plans

**Step 10: Document Risk Assessment**
- Complete Risk Assessment Report
- Include all assessment components
- Document risk assessment methodology
- Include risk response recommendations

---

### 3.4 Review and Approval

**Step 11: Review Risk Assessment**
- Review risk assessment results
- Validate risk determinations
- Review risk response recommendations
- Obtain management review and approval

**Step 12: Implement Risk Responses**
- Implement approved risk mitigations
- Track risk response implementation
- Update POA&M as needed
- Monitor risk response effectiveness

---

## 4. Risk Assessment Schedule

**Annual Risk Assessment:**
- Conducted: Q1 of each calendar year
- Timeline: 4-6 weeks
- Frequency: Annually (minimum)

**Ad-Hoc Risk Assessment:**
- Triggered by: Significant system changes, new threats, security incidents
- Timeline: As needed, typically 2-4 weeks
- Frequency: As required

---

## 5. Risk Assessment Report Template

**Risk Assessment Report Sections:**
1. Executive Summary
2. Assessment Scope
3. System Description
4. Threat Identification
5. Vulnerability Identification
6. Likelihood Assessment
7. Impact Assessment
8. Risk Determination
9. Risk Response Recommendations
10. Appendices

**Report Location:**
- `../04-self-assessment/MAC-AUD-404_Risk_Assessment_Report.md`

---

## 6. Risk Assessment Tools and Resources

**Tools:**
- NIST SP 800-30 (Guide for Conducting Risk Assessments)
- NIST SP 800-171 Rev. 2 (Security Requirements)
- CMMC Assessment Guides
- Vulnerability databases (NVD, CVE)

**Resources:**
- System Security Plan
- System architecture documentation
- Vulnerability scanning results
- Security control assessment results
- Incident reports

---

## 7. Roles and Responsibilities

**Risk Assessment Lead:**
- Coordinate risk assessment activities
- Conduct risk assessment
- Document risk assessment results
- Present risk assessment to management

**Subject Matter Experts:**
- Provide technical expertise
- Review risk assessment results
- Validate risk determinations

**Management:**
- Review and approve risk assessment
- Allocate resources for risk responses
- Make risk-based decisions

---

## 8. Related Documents

- Risk Assessment Policy: `MAC-POL-223_Risk_Assessment_Policy.md`
- Vulnerability Scanning Procedure: `MAC-SOP-230_Vulnerability_Scanning_Procedure.md`
- Risk Assessment Report: `../04-self-assessment/MAC-AUD-404_Risk_Assessment_Report.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md`

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
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-229-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-229-signoff.md`

