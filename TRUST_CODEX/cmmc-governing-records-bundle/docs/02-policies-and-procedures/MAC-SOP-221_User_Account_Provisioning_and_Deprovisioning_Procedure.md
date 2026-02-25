# User Account Provisioning and Deprovisioning Procedure - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure provides detailed step-by-step instructions for provisioning (creating) and deprovisioning (removing) user accounts in the MacTech Solutions system. This procedure supports the Account Lifecycle Enforcement Procedure (`MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`).

---

## 2. Account Provisioning Procedure

### 2.1 Prerequisites

Before provisioning a user account, ensure:
- Business justification for access has been approved
- User role has been determined (USER or ADMIN)
- User email address is available and valid
- User has been notified of account creation

### 2.2 Step-by-Step Provisioning Process

**Step 1: Access Admin Interface**
- Log in to the system as an ADMIN user
- Navigate to `/admin/users`
- Verify admin re-authentication if required

**Step 2: Initiate Account Creation**
- Click "Create User" or equivalent button
- Navigate to user creation form

**Step 3: Enter User Information**
- **Email:** Enter user's email address (must be unique)
- **Name:** Enter user's full name
- **Role:** Select USER or ADMIN based on business need
- **Password:** System automatically generates temporary password (no admin input required)

**Step 4: Validate Input**
- System validates email format
- System validates no CUI-related keywords in input fields
- System checks for duplicate email addresses
- System automatically generates cryptographically secure temporary password (20 characters)

**Step 5: Create Account**
- Click "Create User" button
- System generates temporary password automatically (NIST SP 800-171 Rev. 2, Section 3.5.9)
- System hashes temporary password using bcrypt (12 rounds)
- System creates user record with:
  - `isTemporaryPassword: true`
  - `temporaryPasswordExpiresAt: 72 hours from creation`
  - `mustChangePassword: true`
- System logs account creation event with temporary password generation (AppEvent table)
- System returns temporary password in API response

**Step 6: Notify User**
- Admin receives temporary password from API response
- Admin provides temporary password to user securely (out of band, not via email)
- User receives notification (email or other method) with:
  - System URL
  - Temporary password (provided securely by admin)
  - Instructions to change password on first login
  - Expiration information (72 hours)
  - Link to User Access and FCI Handling Acknowledgement form

**Step 7: User Onboarding**
- User accesses system using temporary password
- System validates temporary password expiration (must be within 72 hours)
- System redirects user to password change page (enforced by `mustChangePassword` flag)
- User sets permanent password meeting complexity requirements (14+ characters)
- System marks password as permanent and clears temporary password flags
- User completes User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`)
- Access is activated

**Evidence:** Account creation is logged in AppEvent table with actionType `admin_action` and details indicating user creation.

---

## 3. Account Deprovisioning Procedure

### 3.1 Prerequisites

Before deprovisioning a user account, ensure:
- Revocation trigger has been identified (see `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`)
- Authorization for revocation has been obtained
- Business justification has been documented

### 3.2 Step-by-Step Deprovisioning Process

**Step 1: Access Admin Interface**
- Log in to the system as an ADMIN user
- Navigate to `/admin/users`
- Verify admin re-authentication if required

**Step 2: Locate User Account**
- Search for user by email or name
- Select user from user list
- Review user account details

**Step 3: Disable or Delete Account**

**Option A: Disable Account (Recommended for Temporary Revocation)**
- Click "Disable" or equivalent action
- Account is marked as disabled in database (User.disabled = true)
- User cannot log in while disabled
- Account can be re-enabled if needed

**Option B: Delete Account (Permanent Removal)**
- Click "Delete" or equivalent action
- Confirm deletion action
- System permanently removes user record from database
- **Note:** Deletion is permanent and cannot be undone

**Step 4: Verify Deprovisioning**
- Verify account is disabled or deleted
- Verify user cannot access system
- Verify user sessions are terminated (if applicable)

**Step 5: Document Deprovisioning**
- Record deprovisioning action in deprovisioning log
- Include: date, time, user email, action taken, authorized by, reason
- System logs deprovisioning event (AppEvent table)

**Step 6: Notify Relevant Parties**
- Notify user (if applicable and appropriate)
- Notify supervisor or project manager
- Update access records

**Evidence:** Account deprovisioning is logged in AppEvent table with actionType `admin_action` and details indicating account revocation or deletion.

---

## 4. Account Modification Procedure

### 4.1 Role Changes

**Step 1: Access Admin Interface**
- Log in as ADMIN user
- Navigate to `/admin/users`
- Locate user account

**Step 2: Modify Role**
- Select user account
- Click "Edit" or equivalent
- Change role (USER ↔ ADMIN)
- Save changes

**Step 3: Verify Changes**
- Verify role change in database
- Verify access permissions reflect new role
- System logs role change event

**Evidence:** Role changes are logged in AppEvent table.

---

## 5. Identifier Reuse Prevention (3.5.5)

### 5.1 Identifier Reuse Policy

**Requirement:** Prevent reuse of identifiers (email addresses) for a defined period after account deletion.

**Implementation:**
- User account identifiers (email addresses) are not reused after account deletion
- Database unique constraint prevents duplicate email addresses
- Deleted account identifiers remain in system history (soft delete) or are permanently removed
- Identifier reuse prevention period: Permanent (identifiers not reused)

### 5.2 Identifier Reuse Prevention Process

**Step 1: Account Deletion**
- When account is deleted, email address is removed from active use
- Email address cannot be reused for new accounts
- Database unique constraint enforces this at database level

**Step 2: Identifier Tracking**
- Deleted account identifiers tracked in system
- Email addresses remain unique in database
- System prevents reuse of deleted identifiers

**Step 3: New Account Creation**
- System validates email address uniqueness
- Database constraint prevents duplicate email addresses
- If email was previously used, new account cannot be created with same email

**Evidence:**
- Database schema: `prisma/schema.prisma` (User model with unique email constraint)
- Identifier Reuse Prevention Evidence: `../05-evidence/MAC-RPT-120_Identifier_Reuse_Prevention_Evidence.md`

---

## 6. Related Documents

- Account Lifecycle Enforcement Procedure: `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`
- Identification and Authentication Policy: `MAC-POL-211_Identification_and_Authentication_Policy.md`
- Identifier Reuse Prevention Evidence: `../05-evidence/MAC-RPT-120_Identifier_Reuse_Prevention_Evidence.md`

### 4.2 Password Reset

**Step 1: Access Admin Interface**
- Log in as ADMIN user
- Navigate to `/admin/users`
- Locate user account

**Step 2: Initiate Password Reset**
- Select user account
- Click "Reset Password" or equivalent
- System automatically generates temporary password (NIST SP 800-171 Rev. 2, Section 3.5.9)
- System sets:
  - `isTemporaryPassword: true`
  - `temporaryPasswordExpiresAt: 72 hours from reset`
  - `mustChangePassword: true`
- System returns temporary password in API response

**Step 3: Notify User**
- Admin receives temporary password from API response
- Admin provides temporary password to user securely (out of band)
- User receives password reset instructions with:
  - Temporary password (provided securely by admin)
  - Instructions to change password on first login
  - Expiration information (72 hours)
- User logs in with temporary password
- System redirects user to password change page
- User sets permanent password meeting complexity requirements
- System marks password as permanent and clears temporary password flags

**Evidence:** Password resets are logged in AppEvent table.

---

## 5. Technical Implementation Details

### 5.1 Account Creation API

**Endpoint:** `POST /api/admin/create-user`

**Implementation:**
- Requires admin authentication (`requireAdmin()`)
- Generates temporary password automatically using `generateTemporaryPassword()`
- Sets temporary password expiration to 72 hours from creation
- Validates input for CUI keywords
- Hashes temporary password using bcrypt (12 rounds)
- Creates user record with temporary password flags:
  - `isTemporaryPassword: true`
  - `temporaryPasswordExpiresAt: 72 hours from now`
  - `mustChangePassword: true`
- Returns temporary password in API response
- Logs account creation event with temporary password generation

**Code Location:** `app/api/admin/create-user/route.ts`

### 5.2 Account Deprovisioning API

**Endpoint:** `PATCH /api/admin/users/[id]` (disable)  
**Endpoint:** `DELETE /api/admin/users/[id]` (delete)

**Implementation:**
- Requires admin re-authentication
- Updates User.disabled field (for disable)
- Deletes user record (for delete)
- Logs deprovisioning event

**Code Location:** `app/api/admin/users/[id]/route.ts`

---

## 6. Related Documents

- Account Lifecycle Enforcement Procedure (`MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`)
- Access Control Policy (`MAC-POL-210_Access_Control_Policy.md`)
- Identification & Authentication Policy (`MAC-POL-211_Identification_and_Authentication_Policy.md`)
- User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`)

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.0 (2026-01-24): Updated from CMMC Level 2 to Level 2, updated scope to FCI and CUI, updated references to NIST SP 800-171 Rev. 2
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-221-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-221-signoff.md`

