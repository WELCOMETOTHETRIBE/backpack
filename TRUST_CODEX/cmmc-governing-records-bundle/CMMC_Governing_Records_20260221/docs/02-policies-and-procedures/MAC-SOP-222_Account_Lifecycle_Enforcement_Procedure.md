# Account Lifecycle Enforcement - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-21  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** FAR 52.204-21

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This document describes the account lifecycle enforcement procedures for the MacTech Solutions system, including account creation approval, revocation triggers, and revocation timeframes. This document addresses assessor concerns regarding evidence of account lifecycle enforcement.

**Related Document:** See `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md` for detailed procedural steps.

---

## 2. Account Creation Approval Process

### 2.1 Approval Workflow

**Step 1: Request Initiation**
- Business need for system access is identified
- Requestor (typically supervisor or project manager) initiates account creation request
- Request includes: user name, email, business justification, requested role

**Step 2: Approval Review**
- Request is reviewed by system administrator or authorized approver
- Business justification is verified
- Role assignment is validated against business need (least privilege)

**Step 3: Approval Decision**
- Approver grants or denies request
- If granted, account creation proceeds
- If denied, requestor is notified with reason

**Step 4: Account Creation**
- System administrator creates user account via admin interface
- User receives initial credentials (if applicable) or password reset instructions
- User is required to complete User Access and FCI Handling Acknowledgement before access

**Step 5: Access Activation**
- User completes acknowledgment form
- User changes password (if required)
- Access is activated

**Evidence:** Account creation is performed via admin interface. See `app/api/admin/create-user/route.ts` for technical implementation.

---

## 3. Account Revocation Triggers

Accounts must be revoked (access terminated) within 24 hours when any of the following conditions occur:

### 3.1 Employee Termination
- **Trigger:** Employee termination (voluntary or involuntary)
- **Action:** Immediate account revocation
- **Timeframe:** Within 24 hours of termination notification
- **Responsible Party:** System administrator or HR designee

### 3.2 Role Change
- **Trigger:** User role change that eliminates business need for access
- **Action:** Account revocation or role modification
- **Timeframe:** Within 24 hours of role change notification
- **Responsible Party:** System administrator

### 3.3 Security Incident
- **Trigger:** Suspected or confirmed security incident involving user account
- **Action:** Immediate account revocation (may be temporary pending investigation)
- **Timeframe:** Immediately upon incident identification
- **Responsible Party:** System administrator or security officer

### 3.4 Policy Violation
- **Trigger:** Violation of FCI handling policies, CUI upload prohibition, or other security policies
- **Action:** Account revocation
- **Timeframe:** Within 24 hours of violation identification
- **Responsible Party:** System administrator

### 3.5 Business Need Elimination
- **Trigger:** Business need for access no longer exists
- **Action:** Account revocation
- **Timeframe:** Within 24 hours of business need elimination
- **Responsible Party:** System administrator or supervisor

### 3.6 Inactive Account (NIST SP 800-171 Rev. 2, Section 3.5.6)
- **Trigger:** Account inactive for 180 days (6 months) without login activity
- **Action:** Automatic account disablement
- **Timeframe:** Automated check runs daily; accounts exceeding 180 days of inactivity are automatically disabled
- **Responsible Party:** System (automated) with administrative oversight
- **Implementation:** 
  - System tracks `lastLoginAt` timestamp for all users
  - Automated process checks for accounts with `lastLoginAt` older than 180 days
  - Accounts that have never logged in and were created more than 180 days ago are also disabled
  - Last active admin account is protected from automatic disablement
  - Disablement is logged in AppEvent table with actionType `user_disable` and reason `inactivity`
- **Evidence:** `lib/inactivity-disable.ts` - Inactivity disablement implementation

---

## 4. Revocation Timeframe

**Standard Revocation Timeframe:** Within 24 hours of trigger event

**Immediate Revocation:** For security incidents or policy violations, revocation occurs immediately upon identification.

**Revocation Process:**
1. Revocation trigger is identified
2. System administrator is notified
3. Account access is revoked via admin interface
4. Revocation is logged (see Section 6)
5. User is notified (if applicable)

**Evidence:** Account revocation is performed via admin interface or database update. Revocation timeframe is procedurally enforced.

---

## 5. Account Modification

**Role Changes:** When user role changes but access is still required:
- Account is modified to reflect new role
- Access permissions are updated
- Modification is logged

**Password Reset:** When password reset is required:
- User requests password reset or administrator initiates reset
- Password reset is performed
- User is required to change password on next login
- Reset is logged

---

## 6. Deprovisioning Log

The following sample log excerpt demonstrates account lifecycle enforcement. This is a sanitized, fictional example for illustrative purposes.

### Sample Deprovisioning Log Excerpt

| Date | Time | User Email | Action | Authorized By | Reason | Status |
|------|------|------------|--------|---------------|--------|--------|
| 2026-01-15 | 14:32 | user1@example.com | Account Revoked | admin@mactech.com | Employee termination | Completed |
| 2026-01-18 | 09:15 | user2@example.com | Role Changed | admin@mactech.com | Role change - no longer requires access | Completed |
| 2026-01-20 | 16:45 | user3@example.com | Account Revoked | admin@mactech.com | Policy violation - CUI upload attempt | Completed |
| 2026-01-22 | 11:20 | user4@example.com | Account Suspended | admin@mactech.com | Security incident investigation | Temporary |
| 2026-01-23 | 10:05 | user5@example.com | Account Revoked | admin@mactech.com | Business need eliminated | Completed |

**Log Fields:**
- **Date:** Date of action
- **Time:** Time of action
- **User Email:** Email address of affected user
- **Action:** Action taken (Account Revoked, Role Changed, Account Suspended)
- **Authorized By:** Email of administrator who authorized/executed action
- **Reason:** Reason for action (termination, role change, security incident, policy violation, etc.)
- **Status:** Status of action (Completed, Temporary, Pending)

**Note:** This is a sample log for illustrative purposes. Actual logs contain additional detail and are maintained in accordance with organizational record-keeping requirements.

---

## 7. Enforcement Evidence

### 7.1 Technical Enforcement

**Account Creation:**
- Evidence: `app/api/admin/create-user/route.ts` - Account creation API endpoint
- Evidence: `prisma/schema.prisma` - User model with unique email constraint
- Evidence: Admin interface for account management

**Account Revocation:**
- Evidence: Admin interface for account deactivation/deletion
- Evidence: Database update operations via Prisma ORM
- Evidence: Middleware enforcement of authentication (revoked users cannot authenticate)

**Access Control:**
- Evidence: `middleware.ts` - Authentication and authorization enforcement
- Evidence: `lib/auth.ts` - Authentication system

### 7.2 Procedural Enforcement

**Approval Process:**
- Account creation requires administrative approval
- Business justification is required
- User acknowledgment is required before access

**Revocation Process:**
- Revocation triggers are clearly defined
- 24-hour timeframe is procedurally enforced
- Revocation actions are logged

**Evidence:** This document and related procedures demonstrate procedural enforcement.

---

## 8. Compliance Risks & Open Items

### 8.1 Automated Revocation

**Status:** Automated revocation for inactivity (NIST SP 800-171 Rev. 2, Section 3.5.6) is implemented. Accounts inactive for 180 days are automatically disabled. Other revocation triggers are performed manually by administrators within the 24-hour timeframe.

**Implementation:**
- Inactivity disablement: `lib/inactivity-disable.ts` - Automated check and disablement of inactive accounts
- Manual revocation: Performed via admin interface for other triggers (termination, role change, security incidents, policy violations)

### 8.2 Formal Audit Logging

**Status:** Account lifecycle events are logged procedurally. Formal audit logging system may be implemented as a future enhancement.

---

## 9. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation to address assessor finding L1-AC-02

---

## Appendix A: Related Documents

- User Account Provisioning and Deprovisioning Procedure (`MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`)
- Access Control Policy (`MAC-POL-210_Access_Control_Policy.md`)
- User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`)

## Appendix B: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Account Creation | `app/api/admin/create-user/route.ts` |
| User Model | `prisma/schema.prisma` (User model) |
| Authentication | `lib/auth.ts`, `middleware.ts` |
| Access Control | `middleware.ts` (lines 19-40) |
| Inactivity Disablement (3.5.6) | `lib/inactivity-disable.ts` |
| Inactivity Disablement API | `app/api/admin/users/disable-inactive/route.ts` |
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-222-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-222-signoff.md`

