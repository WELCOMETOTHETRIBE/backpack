# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-223_Risk_Assessment_Policy.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Risk Assessment Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.11

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains a risk assessment program to identify, assess, and manage risks to organizational operations, organizational assets, and individuals resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI. This policy establishes requirements for conducting risk assessments, vulnerability scanning, and vulnerability remediation.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.11 (Risk Assessment).

---

## 2. Scope

This policy applies to:
- All organizational systems that process, store, or transmit CUI
- All system components (hardware, software, firmware, documentation)
- All personnel with responsibility for system security
- All risk assessment activities
- All vulnerability management activities

**System Scope:** FCI and CUI environment.

---

## 3. Risk Assessment Requirements

### 3.1 Periodic Risk Assessment (3.11.1)

**Requirement:** Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.

**Implementation:**
- Risk assessments conducted periodically (annually minimum)
- Risk assessments consider threats, vulnerabilities, likelihood, and impact
- Risk assessments cover organizational operations, assets, and individuals
- Risk assessments consider risk from external parties (service providers, contractors)
- Risk assessment methodology documented in Risk Assessment Procedure
- Risk assessment results documented in Risk Assessment Report

**Frequency:**
- Annual risk assessment: Conducted each calendar year
- Ad-hoc risk assessment: Conducted when significant system changes occur or new threats identified
- Risk assessment schedule documented and maintained

**Responsible Party:** System Administrator or designated security contact

**Evidence:**
- Risk Assessment Report: `../04-self-assessment/MAC-AUD-404_Risk_Assessment_Report.md`
- Risk Assessment Procedure: `MAC-SOP-229_Risk_Assessment_Procedure.md`

---

### 3.2 Vulnerability Scanning (3.11.2)

**Requirement:** Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.

**Implementation:**
- Vulnerability scanning conducted periodically (weekly minimum for dependencies)
- Application vulnerability scanning conducted as needed
- Vulnerability scanning triggered when new vulnerabilities identified
- Vulnerability scanning covers all system components
- Vulnerability scanning results documented
- Vulnerability scanning schedule established

**Scanning Methods:**
- Dependency vulnerability scanning: GitHub Dependabot (weekly automated scanning)
- Application vulnerability scanning: Manual and automated tools as needed
- Platform vulnerability scanning: hosting environment (historical) (inherited)
- Vulnerability scanning tools validated and maintained

**Responsible Party:** System Administrator

**Evidence:**
- Vulnerability Scanning Procedure: `MAC-SOP-230_Vulnerability_Scanning_Procedure.md`
- Dependabot configuration: `.github/dependabot.yml`
- Vulnerability scanning results: Documented in vulnerability remediation logs

---

### 3.3 Vulnerability Remediation (3.11.3)

**Requirement:** Remediate vulnerabilities in accordance with risk assessments.

**Implementation:**
- Vulnerabilities prioritized based on risk assessment
- Remediation timeline based on risk severity
- Critical vulnerabilities: Addressed promptly
- High-severity vulnerabilities: Addressed in next development cycle
- Medium and low-severity vulnerabilities: Addressed as resources permit
- Vulnerability remediation tracked and documented
- Remediation verified and validated

**Remediation Process:**
1. Vulnerability identified via scanning or other means
2. Risk assessment conducted for vulnerability
3. Vulnerability prioritized based on risk
4. Remediation plan developed
5. Remediation implemented
6. Remediation verified
7. Remediation documented

**Responsible Party:** System Administrator, Development Team

**Evidence:**
- Vulnerability Remediation Procedure: `MAC-SOP-230_Vulnerability_Scanning_Procedure.md`
- Vulnerability remediation logs: `../05-evidence/vulnerability-remediation/recent-remediations.md`
- Risk assessment results used for prioritization

---

## 4. Risk Assessment Methodology

### 4.1 Risk Assessment Approach

**Risk Assessment Framework:**
- Risk assessments follow NIST SP 800-30 guidance
- Risk assessments consider threats, vulnerabilities, likelihood, and impact
- Risk assessments cover organizational operations, assets, and individuals
- Risk assessments consider system boundaries and architecture

**Risk Assessment Components:**
- Threat identification
- Vulnerability identification
- Likelihood assessment
- Impact assessment
- Risk determination
- Risk response planning

### 4.2 Risk Assessment Documentation

**Risk Assessment Report Includes:**
- System boundaries and scope
- Threat sources and threat events
- Vulnerabilities identified
- Likelihood and impact assessments
- Risk levels determined
- Risk response recommendations
- Risk assessment date and assessor

**Risk Assessment Report:**
- Documented in: `../04-self-assessment/MAC-AUD-404_Risk_Assessment_Report.md`
- Reviewed and approved by management
- Retained per document retention policy

---

## 5. Vulnerability Management

### 5.1 Vulnerability Identification

**Vulnerability Sources:**
- Automated vulnerability scanning (Dependabot)
- Security advisories (CISA, vendors, NVD)
- Security assessments
- Incident response activities
- User reports

### 5.2 Vulnerability Prioritization

**Prioritization Factors:**
- Risk assessment results
- Vulnerability severity (CVSS score)
- Exploitability
- System criticality
- Business impact

### 5.3 Vulnerability Remediation

**Remediation Timeline:**
- Critical: Immediate action required
- High: Remediate within 30 days
- Medium: Remediate within 90 days
- Low: Remediate as resources permit

**Remediation Tracking:**
- Vulnerabilities tracked in vulnerability remediation log
- Remediation status updated regularly
- Remediation completion verified

---

## 6. Roles and Responsibilities

### 6.1 System Administrator

**Responsibilities:**
- Conduct risk assessments
- Coordinate vulnerability scanning
- Manage vulnerability remediation
- Document risk assessment results
- Maintain vulnerability remediation logs

### 6.2 Development Team

**Responsibilities:**
- Implement vulnerability remediations
- Test remediation implementations
- Verify remediation effectiveness

### 6.3 Management

**Responsibilities:**
- Review and approve risk assessments
- Allocate resources for vulnerability remediation
- Make risk-based decisions

---

## 7. Related Documents

- Risk Assessment Procedure: `MAC-SOP-229_Risk_Assessment_Procedure.md`
- Vulnerability Scanning Procedure: `MAC-SOP-230_Vulnerability_Scanning_Procedure.md`
- Risk Assessment Report: `../04-self-assessment/MAC-AUD-404_Risk_Assessment_Report.md`
- Vulnerability Management: `../06-supporting-documents/MAC-SEC-106_Vulnerability_Management.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 12)

---

## 8. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2

---

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.11 (Risk Assessment)
- NIST SP 800-30 (Guide for Conducting Risk Assessments)
- NIST SP 800-40 (Guide to Enterprise Patch Management Planning)
- CMMC 2.0 Level 2 Assessment Guide
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-223-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-223-signoff.md`



---
**QMS signature (SHA-256):** `f6103b627eb8fc76fc157fef4781065511d342348afd3b43724a132a5fdb5188`
