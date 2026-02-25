# Personnel Termination Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.9.2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for protecting organizational systems containing CUI during and after personnel actions such as terminations and transfers.

---

## 2. Scope

This procedure applies to:
- All personnel terminations
- All personnel transfers
- All system access revocation
- All CUI access protection

---

## 3. Termination Process

### 3.1 Termination Notification

**Step 1: Receive Termination Notice**
- Management notifies System Administrator of termination
- Termination date and time confirmed
- Immediate action required

**Step 2: Immediate Access Revocation**
- Disable user account immediately
- Revoke system access
- Revoke physical access (if applicable)
- Revoke all authentication credentials

---

### 3.2 Access Revocation

**Step 1: Disable User Account**
- Set account to disabled status
- Prevent new logins
- Terminate active sessions
- Document account disablement

**Step 2: Verify CUI Access Removed**
- Verify user no longer has CUI access
- Verify CUI data not accessible
- Document access revocation

**Step 3: Collect Organizational Assets**
- Collect system access devices (if applicable)
- Collect credentials (if applicable)
- Document asset collection

---

### 3.3 Documentation

**Termination Documentation:**
- Termination date and time
- Access revocation actions
- Account disablement confirmation
- CUI access verification
- Asset collection (if applicable)

---

## 4. Transfer Process

### 4.1 Transfer Notification

**Step 1: Receive Transfer Notice**
- Management notifies System Administrator of transfer
- New role identified
- Access requirements for new role determined

**Step 2: Access Review**
- Review current access
- Determine access needed for new role
- Adjust access as needed
- Verify CUI access appropriate

---

### 4.2 Access Adjustment

**Step 1: Adjust Access**
- Modify user role if needed
- Adjust permissions as needed
- Verify access appropriate for new role
- Document access changes

**Step 2: Verify CUI Access**
- Verify CUI access appropriate for new role
- Remove CUI access if not needed
- Document CUI access status

---

## 5. Roles and Responsibilities

**Management:**
- Notify of terminations/transfers
- Approve access changes
- Oversee termination/transfer process

**System Administrator:**
- Revoke access upon termination
- Adjust access upon transfer
- Document termination/transfer actions
- Verify CUI access protection

---

## 6. Related Documents

- Personnel Security Policy: `MAC-POL-222_Personnel_Security_Policy.md`
- User Account Provisioning Procedure: `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.7)

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

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-234-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-234-signoff.md`

