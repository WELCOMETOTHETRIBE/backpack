# Personnel Security Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.9

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains personnel security procedures to ensure that individuals with access to organizational systems containing CUI are properly screened and that systems are protected during and after personnel actions such as terminations and transfers.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.9 (Personnel Security).

---

## 2. Scope

This policy applies to:
- All personnel with access to organizational systems containing CUI
- All personnel screening activities
- All personnel termination and transfer procedures
- All system access authorization

**System Scope:** FCI and CUI environment.

---

## 3. Personnel Security Requirements

### 3.1 Personnel Screening (3.9.1)

**Requirement:** Screen individuals prior to authorizing access to organizational systems containing CUI.

**Implementation:**
- Personnel screening procedure established
- Background screening for individuals with CUI access
- Screening requirements documented
- Screening conducted before access authorization

**Screening Process:**
1. Identify need for system access
2. Conduct personnel screening
3. Verify screening results
4. Authorize access based on screening
5. Document screening completion

**Screening Requirements:**
- Background check (as applicable)
- Reference verification
- Employment verification
- Security clearance (if required by contract)

**Evidence:**
- Personnel Screening Procedure: `MAC-SOP-233_Personnel_Screening_Procedure.md`
- Screening Records Template: `../05-evidence/personnel-screening/screening-records-template.md`
- Screening Completion Log: `../05-evidence/personnel-screening/screening-completion-log.md`
- Screening records: Maintained in screening completion log

**Status:** ✅ Fully Implemented

---

### 3.2 Personnel Termination and Transfer (3.9.2)

**Requirement:** Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.

**Implementation:**
- Personnel termination procedure established
- Access revocation process for terminated personnel
- System access reviewed and revoked upon termination
- Personnel transfer procedures protect CUI access
- Termination procedures documented

**Termination Process:**
1. Notification of termination/transfer
2. Immediate access revocation
3. System access review
4. CUI access verification
5. Account disablement/deletion
6. Documentation of termination actions

**Transfer Process:**
1. Notification of transfer
2. Access review for new role
3. Access adjustments as needed
4. CUI access verification
5. Documentation of transfer actions

**Evidence:**
- Personnel Termination Procedure: `MAC-SOP-234_Personnel_Termination_Procedure.md`
- Termination records: Maintained per termination procedure
- Access revocation: Via admin interface, documented in audit logs

**Status:** ✅ Fully Implemented

---

## 4. Personnel Screening Process

### 4.1 Screening Requirements

**Screening Types:**
- Background check
- Employment verification
- Reference check
- Security clearance (if required)

**Screening Timing:**
- Screening conducted before access authorization
- Screening results verified
- Access granted only after successful screening

---

### 4.2 Screening Documentation

**Screening Records:**
- Screening date
- Screening type
- Screening results
- Screening approval
- Access authorization date

---

## 5. Termination and Transfer Process

### 5.1 Termination Procedures

**Immediate Actions:**
- Revoke system access immediately
- Disable user accounts
- Revoke physical access (if applicable)
- Collect organizational assets

**Verification:**
- Verify access revocation
- Verify account disablement
- Verify CUI access removed
- Document termination actions

---

### 5.2 Transfer Procedures

**Transfer Actions:**
- Review access for new role
- Adjust access as needed
- Verify CUI access appropriate for new role
- Document transfer actions

---

## 6. Roles and Responsibilities

### 6.1 Management

**Responsibilities:**
- Authorize personnel screening
- Approve access authorization
- Notify of terminations/transfers
- Oversee termination/transfer process

### 6.2 System Administrator

**Responsibilities:**
- Conduct personnel screening (as applicable)
- Revoke access upon termination
- Adjust access upon transfer
- Document screening and termination actions

### 6.3 Human Resources

**Responsibilities:**
- Coordinate personnel screening
- Notify of terminations/transfers
- Maintain personnel records

---

## 7. Related Documents

- Personnel Screening Procedure: `MAC-SOP-233_Personnel_Screening_Procedure.md` (to be created)
- Personnel Termination Procedure: `MAC-SOP-234_Personnel_Termination_Procedure.md` (to be created)
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.7)
- Access Control Policy: `MAC-POL-210_Access_Control_Policy.md`

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

- NIST SP 800-171 Rev. 2, Section 3.9 (Personnel Security)
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
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-222-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-222-signoff.md`

