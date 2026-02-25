# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-233_Personnel_Screening_Procedure.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Personnel Screening Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.9.1

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for screening individuals prior to authorizing access to organizational systems containing CUI.

---

## 2. Scope

This procedure applies to:
- All personnel requiring access to systems containing CUI
- All screening activities
- All access authorization decisions

---

## 3. Screening Process

### 3.1 Screening Requirements

**Screening Types:**
- Background check (as applicable)
- Employment verification
- Reference check
- Security clearance (if required by contract)

**Screening Timing:**
- Screening conducted before access authorization
- Screening results verified
- Access granted only after successful screening

---

### 3.2 Screening Execution

**Step 1: Identify Access Need**
- Determine system access requirements
- Identify CUI access needs
- Document access justification

**Step 2: Conduct Screening**
- Perform background check (if applicable)
- Verify employment
- Check references
- Verify security clearance (if required)

**Step 3: Review Screening Results**
- Review screening results
- Verify screening completeness
- Assess screening results
- Make access authorization decision

**Step 4: Authorize Access**
- Grant access if screening successful
- Document access authorization
- Provide system access credentials
- Complete user agreement

---

## 4. Screening Documentation

**Screening Records:**
- Screening date
- Screening type
- Screening results
- Screening approval
- Access authorization date

**Record Retention:**
- Screening records retained per document retention policy
- Records available for assessment

---

## 5. Roles and Responsibilities

**Management:**
- Authorize personnel screening
- Approve access authorization
- Review screening results

**System Administrator:**
- Conduct screening (as applicable)
- Review screening results
- Authorize system access
- Document screening and authorization

---

## 6. Related Documents

- Personnel Security Policy: `MAC-POL-222_Personnel_Security_Policy.md`
- User Account Provisioning Procedure: `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.7)

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-233-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-233-signoff.md`



---
**QMS signature (SHA-256):** `949e026be55fefe42998876982616a62b5fb6b6e712510100e54a570b3fa01b1`
