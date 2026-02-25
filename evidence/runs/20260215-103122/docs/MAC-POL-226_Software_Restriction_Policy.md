# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-226_Software_Restriction_Policy.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Software Restriction Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.4.8

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This policy establishes requirements for restricting the use of software within organizational systems to ensure only approved and necessary software is used.

---

## 2. Scope

This policy applies to:
- All software used in organizational systems
- All application dependencies
- All third-party libraries
- All system software

---

## 3. Software Restrictions

### 3.1 Approved Software

**Approved Software Sources:**
- Dependencies listed in `package.json`
- Dependencies from npm registry (vetted)
- System software provided by hosting environment (historical) (inherited)
- Software reviewed and approved before use

**Approval Process:**
- Software reviewed for security vulnerabilities
- Software reviewed for functionality
- Software approved before addition to system
- Software inventory updated

---

### 3.2 Prohibited Software

**Prohibited Software:**
- Unauthorized third-party software
- Software with known security vulnerabilities (unless patched)
- Software not required for system functionality
- Unapproved software installations

---

## 4. Software Inventory

### 4.1 Inventory Requirements

**Inventory Components:**
- Application dependencies (`package.json`)
- Node.js version
- Framework versions (Next.js, React)
- Library versions
- Tool versions

**Inventory Maintenance:**
- Inventory updated with each software change
- Inventory reviewed quarterly
- Inventory verified for accuracy

**Inventory Location:**
- Configuration Baseline Evidence: `../05-evidence/MAC-RPT-108_Configuration_Baseline_Evidence.md`
- `package.json` file

---

## 5. Software Management

### 5.1 Dependency Management

**Dependency Process:**
- Dependencies added via `package.json`
- Dependencies reviewed before addition
- Security vulnerabilities monitored
- Updates applied when available
- Vulnerable dependencies remediated

**Vulnerability Management:**
- Dependabot scans dependencies weekly
- Vulnerabilities identified and remediated
- Remediation tracked in vulnerability logs

---

### 5.2 Software Updates

**Update Process:**
- Security updates prioritized
- Updates tested before deployment
- Updates deployed via version control
- Updates documented in change log

---

## 6. Related Documents

- Configuration Management Policy: `MAC-POL-220_Configuration_Management_Policy.md`
- Configuration Management Plan: `MAC-CMP-001_Configuration_Management_Plan.md`
- Vulnerability Scanning Procedure: `MAC-SOP-230_Vulnerability_Scanning_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.5, 3.4.8)

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** 2026-04-23

**Change History:**
- Version 1.0 (2026-01-23): Initial software restriction policy creation
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-226-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-226-signoff.md`



---
**QMS signature (SHA-256):** `f79c1f74863341bd7e9e05dc74aab36b45bb4aa115d9d059cbb35370d2e1680e`
