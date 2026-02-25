# Identification & Authentication Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.5

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions requires all users to be uniquely identified and authenticated before accessing the system. This policy establishes requirements for user identification, authentication mechanisms, multifactor authentication, password management, and identifier lifecycle management to protect Federal Contract Information (FCI) and Controlled Unclassified Information (CUI).

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.5 (Identification and Authentication).

**Level 1 Continuity:** All Level 1 FCI protection requirements remain in effect and are preserved in this policy.

---

## 2. Scope

This policy applies to:
- All users accessing the MacTech Solutions system
- All authentication mechanisms and processes
- All multifactor authentication (MFA) requirements
- All password management procedures
- All user account management activities
- All identifier lifecycle management
- FCI and CUI protection requirements

---

## 3. User Identification

### 3.1 Unique User Identification (FAR 52.204-21(b)(1))

**Requirement:** Each user must have a unique identifier that distinguishes them from all other users.

**Implementation:**
- Users are identified by unique email addresses
- Database schema enforces uniqueness constraint
- Each user account has a unique system-generated identifier (`id`)
- Evidence: `prisma/schema.prisma` (User model, line 16: `email String @unique`)

**Identification Mechanism:**
- Primary identifier: Email address (unique, case-insensitive)
- System identifier: CUID (cryptographically unique identifier)
- Evidence: `prisma/schema.prisma` (User model, lines 14-27)

**Enforcement:**
- Prisma ORM enforces uniqueness at database level
- Application-level validation prevents duplicate email addresses
- Evidence: `app/api/admin/create-user/route.ts` (lines 28-37)

---

### 3.2 User Account Structure

**Account Attributes:**
- `id`: Unique system identifier (CUID)
- `email`: Unique email address (primary identifier)
- `name`: Optional display name
- `password`: Encrypted password hash (bcrypt)
- `role`: User role (USER or ADMIN)
- `mustChangePassword`: Flag requiring password change on next login
- Evidence: `prisma/schema.prisma` (User model, lines 14-27)

**Account Creation:**
- Accounts are created by administrators
- Email address must be unique
- Password is required and must meet minimum requirements
- Evidence: `app/api/admin/create-user/route.ts`

---

## 4. Authentication Mechanisms

### 4.1 Authentication System

**Technology:** NextAuth.js with credentials provider

**Authentication Method:** Email and password

**Session Management:** Token-based session handling via NextAuth.js

**Evidence:** `lib/auth.ts` (lines 7-95)

---

### 4.2 Authentication Flow

**Process:**
1. User provides email and password credentials
2. System normalizes email (lowercase, trimmed)
3. System queries database for user by email or name (case-insensitive)
4. System retrieves stored password hash
5. System compares provided password with stored hash using bcrypt
6. If password matches, user is authenticated and session is created
7. Session token is used for subsequent requests
8. Evidence: `lib/auth.ts` (lines 18-56)

**Authentication Code Flow:**
```
User submits credentials
  → Normalize email (line 23)
  → Query database (lines 26-33)
  → Retrieve user and password hash
  → Compare password using bcrypt (lines 39-42)
  → If valid: Return user object (lines 48-55)
  → If invalid: Return null (lines 35-36, 44-45)
```

**Evidence:** `lib/auth.ts` (lines 18-56)

---

### 4.3 Session Management

**Session Strategy:** Token-based authentication via NextAuth.js

**Session Storage:** Token-based (stateless)

**Session Validation:** Tokens are validated on each request via middleware

**Evidence:** `lib/auth.ts` (lines 59-60: `strategy: "jwt"`)

**What is Enforced:**
- Session tokens are validated on each request
- No explicit token revocation mechanism is implemented
- Session management uses NextAuth.js token-based authentication
- Tokens are validated via middleware before allowing access to protected routes

**Session Callbacks:**
- Token callback: Manages token creation and updates
- Session callback: Maps token data to session object
- Evidence: `lib/auth.ts` (lines 65-94)

**Limitations:**
- No explicit token revocation mechanism
- No adaptive authentication
- No multi-factor authentication (MFA)

---

## 5. Password Management

### 5.1 Password Hashing (FAR 52.204-21(b)(1))

**Requirement:** Passwords must be encrypted at rest.

**Implementation:**
- Passwords are hashed using bcrypt
- Bcrypt rounds: 12 (configurable)
- Passwords are never stored in plaintext
- Evidence: `lib/auth.ts` (line 5: `import bcrypt`), `lib/password-policy.ts` (PASSWORD_POLICY.bcryptRounds = 12)

**Password Hashing Process:**
1. User provides plaintext password
2. System hashes password using bcrypt with 12 rounds
3. Hashed password is stored in database
4. Plaintext password is never stored
5. Evidence: `lib/password-policy.ts` (PASSWORD_POLICY.bcryptRounds = 12)

**Password Verification Process:**
1. User provides plaintext password during login
2. System retrieves stored password hash from database
3. System compares provided password with hash using bcrypt.compare()
4. If match: Authentication succeeds
5. If no match: Authentication fails
6. Evidence: `lib/auth.ts` (lines 39-42)

---

### 5.2 Password Requirements

**Minimum Length:** 14 characters

**Enforcement:**
- Password length validation occurs during password change
- Validation error returned if password is less than 14 characters
- Evidence: `app/api/auth/change-password/route.ts` (uses `validatePassword()` from `lib/password-policy.ts`)

**Password Requirements:**
- Minimum 14 characters
- No maximum length specified
- Password complexity requirements implemented per Level 2 controls
- Cannot be a common password (denylist check)
- Cannot reuse any of the last 5 passwords

**Password Change Validation:**
```typescript
// Password validation uses validatePassword() from lib/password-policy.ts
// which enforces minimum 14 characters and other complexity requirements
const passwordValidation = validatePassword(newPassword)
if (!passwordValidation.valid) {
  return NextResponse.json(
    { error: 'Password does not meet requirements', errors: passwordValidation.errors },
    { status: 400 }
  )
}
```

**Evidence:** `app/api/auth/change-password/route.ts` (lines 26-31)

---

### 5.3 Password Change Process

**User-Initiated Password Change:**
1. User must provide current password
2. User must provide new password
3. System validates current password
4. System validates new password meets requirements (minimum 14 characters, complexity, not common password, not reused)
5. System verifies new password is different from current password
6. System hashes new password using bcrypt
7. System updates password in database
8. System clears `mustChangePassword` flag
9. Evidence: `app/api/auth/change-password/route.ts` (lines 6-90)

**Password Change Validation:**
- Current password verification (lines 46-49)
- New password length check (lines 26-31)
- Password difference check (lines 59-65)
- Evidence: `app/api/auth/change-password/route.ts`

---

### 5.4 Forced Password Change

**Mechanism:** `mustChangePassword` flag

**Purpose:** Require users to change password on first login or after administrative reset

**Enforcement:**
- Middleware checks `mustChangePassword` flag
- If flag is true, user is redirected to password change page
- User cannot access other pages until password is changed
- Evidence: `middleware.ts` (lines 35-38)

**Flag Management:**
- Set during user creation (if needed)
- Set during administrative password reset
- Cleared after successful password change
- Evidence: `app/api/auth/change-password/route.ts` (line 75)

---

### 5.5 Temporary Passwords (NIST SP 800-171 Rev. 2, Section 3.5.9)

**Requirement:** Allow temporary password use for system logons with an immediate change to a permanent password.

**Implementation:**
- Temporary passwords are automatically generated for new user accounts
- Temporary passwords are automatically generated for password resets
- Temporary passwords are cryptographically secure (20 characters, random)
- Temporary passwords expire after 72 hours
- Users must change temporary passwords to permanent passwords immediately upon first login
- Expired temporary passwords are rejected at login

**Temporary Password Generation:**
- System automatically generates temporary passwords (no admin input required)
- Passwords are 20 characters long with mix of uppercase, lowercase, numbers, and special characters
- Generation uses cryptographically secure random number generator (`crypto.randomBytes()`)
- **Code Implementation:**
  - `lib/temporary-password.ts:generateTemporaryPassword()` (lines 30-60) - Core generation function
  - `lib/temporary-password.ts:getTemporaryPasswordExpiration()` (lines 95-100) - Sets 72-hour expiration
  - `app/api/admin/create-user/route.ts` (lines 41-43, 49-56) - Generates temporary password during user creation
  - `app/api/admin/reset-user-password/route.ts` (lines 48-50, 65-74) - Generates temporary password during password reset
- **Configuration:** `lib/temporary-password.ts:TEMPORARY_PASSWORD_CONFIG` (lines 10-18) - minLength: 16, defaultLength: 20, expirationHours: 72

**Temporary Password Expiration:**
- Temporary passwords expire 72 hours after generation
- Expiration timestamp stored in `temporaryPasswordExpiresAt` field
- System checks expiration before allowing login
- Expired temporary passwords are rejected with appropriate error message
- **Code Implementation:**
  - `lib/temporary-password.ts:isTemporaryPasswordExpired()` (lines 82-89) - Validates expiration
  - `lib/password-policy.ts:validateTemporaryPasswordExpiration()` (lines 131-137) - Additional validation
  - `lib/auth.ts` (lines 83-93) - Checks expiration in `authorize` function before allowing login
  - `prisma/schema.prisma` (line 23) - `temporaryPasswordExpiresAt: DateTime?` database field

**Forced Password Change:**
- Users with temporary passwords are required to change password on first login
- System redirects to password change page before allowing access
- User must set permanent password meeting full complexity requirements (14+ characters)
- After change, password is marked as permanent and expiration is cleared
- **Code Implementation:**
  - `middleware.ts` (lines 38-43, 61-66) - Enforces redirect to `/auth/change-password` when `mustChangePassword: true`
  - `app/api/auth/custom-signin/route.ts` (lines 99-110) - Checks `mustChangePassword` BEFORE MFA enrollment
  - `app/auth/signin/page.tsx` (lines 37-44) - Redirects to password change page if required
  - `app/api/auth/change-password/route.ts` (lines 95-105) - Handles temporary to permanent transition, clears flags
  - `app/api/auth/mfa/enroll/route.ts` (lines 22-30) - Prevents MFA enrollment if password change required
  - `app/auth/mfa/enroll/page.tsx` (lines 18-38) - Client-side check and redirect for password change requirement
  - `prisma/schema.prisma` (line 22) - `isTemporaryPassword: Boolean @default(false)` database field
  - `prisma/schema.prisma` (line 21) - `mustChangePassword: Boolean @default(false)` database field

**Temporary Password Distribution:**
- Temporary passwords are returned in API response for user creation and password reset
- Administrators must provide temporary passwords to users securely (out of band)
- Temporary passwords should not be logged or stored in plaintext
- Evidence: `app/api/admin/create-user/route.ts` (returns `temporaryPassword` in response)
- Evidence: `app/api/admin/reset-user-password/route.ts` (returns `temporaryPassword` in response)

**Database Fields:**
- `isTemporaryPassword: Boolean` - Flag indicating if current password is temporary
- `temporaryPasswordExpiresAt: DateTime?` - Expiration timestamp for temporary passwords
- Evidence: `prisma/schema.prisma` (User model)

**Audit Logging:**
- Temporary password generation is logged
- Temporary password usage for login is logged
- Temporary password expiration attempts are logged
- Temporary to permanent password changes are logged
- Evidence: `app/api/admin/create-user/route.ts` (audit logging)
- Evidence: `app/api/admin/reset-user-password/route.ts` (audit logging)
- Evidence: `app/api/auth/change-password/route.ts` (audit logging)

---

## 6. Admin Account Protection

### 6.1 Admin Account Identification

**Admin Role:** Users with `role = "ADMIN"`

**Admin Access:** Full access to admin portal and system management functions

**Evidence:** `prisma/schema.prisma` (User model, line 19: `role String @default("USER")`)

---

### 6.2 Admin Account Authentication

**Same Authentication Requirements:** Admin accounts use the same authentication mechanism as regular users

**Additional Protection:** Admin routes require ADMIN role in addition to authentication

**Evidence:** `middleware.ts` (line 29: `session.user?.role !== "ADMIN"`)

---

### 6.3 Admin Account Management

**Creation:** Only existing ADMIN users can create new admin accounts

**Evidence:** `app/api/admin/create-user/route.ts` (lines 10-16)

**Password Reset:** Admin users can reset passwords for other users (if functionality implemented)

### 6.4 Multifactor Authentication for All Users (Level 2 - 3.5.3)

**Requirement:** Multifactor authentication (MFA) is required for all users accessing CUI systems for local and network access.

**Implementation:**
- MFA implementation completed
- MFA solution: NextAuth.js with TOTP Provider
- MFA required for all users (USER and ADMIN roles) accessing CUI systems
- MFA enrollment required before first CUI system access
- MFA verification required on every login for all users

**MFA Method:**
- Time-based One-Time Password (TOTP)
- TOTP apps: Google Authenticator, Authy, or compatible TOTP apps
- Backup codes provided during enrollment

**MFA Enforcement:**
- MFA mandatory for all users accessing CUI systems
- No MFA bypass for any user accounts
- All users must enroll in MFA before accessing CUI functionality

**Evidence:**
- MFA Implementation Guide: `../06-supporting-documents/MAC-SEC-108_MFA_Implementation_Guide.md`
- MFA implementation: `lib/mfa.ts` (`isMFARequired()` returns true for all users)
- MFA enrollment UI: `app/auth/mfa/enroll/page.tsx`
- MFA verification: `app/auth/mfa/verify/page.tsx`

**Status:** ✅ Implemented - MFA required for all users accessing CUI systems

---

## 7. Authentication Security

### 7.1 Credential Protection

**In Transit:** All authentication communications are encrypted via HTTPS/TLS (inherited from Microsoft Azure / CUI enclave VM)

**At Rest:** Passwords are hashed using bcrypt

**In Memory:** Credentials are handled securely by NextAuth.js and bcrypt libraries

---

### 7.2 Session Security

**Session Management:** Session management uses token-based authentication via NextAuth.js. Tokens are validated on each request.

**Token Storage:** Tokens are managed by NextAuth.js

**Session Validation:** Every request to protected routes validates session tokens

**What is Enforced:** Tokens are validated on each request. No explicit token revocation mechanism is implemented.

**Evidence:** `middleware.ts` (line 7: `const session = req.auth`)

---

### 7.3 Failed Authentication Handling

**Behavior:** Failed authentication attempts return null (no user object)

**No Information Disclosure:** System does not reveal whether email exists or password is incorrect

**Evidence:** `lib/auth.ts` (lines 35-36, 44-45: `return null`)

---

## 8. Level 2 Requirements (NIST SP 800-171 Rev. 2, Section 3.5)

### 8.1 Multifactor Authentication (3.5.3)

**Requirement:** Use multifactor authentication for local and network access to privileged accounts and for network access to nonprivileged accounts.

**Implementation:**
- MFA required for all users (USER and ADMIN roles) accessing CUI systems
- MFA implementation: NextAuth.js with TOTP Provider
- MFA enrollment required before first CUI system access
- MFA verification required on every login for all users
- All users accessing CUI systems are subject to MFA requirements

**MFA Method:**
- Time-based One-Time Password (TOTP)
- Compatible with standard TOTP apps (Google Authenticator, Authy, etc.)
- Backup codes provided during enrollment

**Status:** ✅ Implemented - MFA required for all users accessing CUI systems

**Evidence:**
- MFA Implementation Guide: `../06-supporting-documents/MAC-SEC-108_MFA_Implementation_Guide.md`
- MFA implementation: `lib/mfa.ts` (`isMFARequired()` function)
- MFA enrollment: `app/auth/mfa/enroll/page.tsx`
- MFA verification: `app/auth/mfa/verify/page.tsx`
- MFA Evidence: `../05-evidence/MAC-RPT-104_MFA_Implementation_Evidence.md`

---

### 8.2 Replay-Resistant Authentication (3.5.4)

**Requirement:** Employ replay-resistant authentication mechanisms for network access to privileged and nonprivileged accounts.

**Implementation:**
- JWT tokens used for authentication (replay-resistant)
- Session tokens include timestamps and expiration
- Token-based authentication prevents replay attacks
- HTTPS/TLS prevents network-level replay (inherited)

**Status:** ✅ Implemented

**Evidence:**
- `lib/auth.ts` (JWT token generation)
- NextAuth.js session management
- TLS encryption: Microsoft Azure / CUI enclave VM (inherited)

---

### 8.3 Prevent Identifier Reuse (3.5.5)

**Requirement:** Prevent reuse of identifiers for a defined period.

**Implementation:**
- Identifier reuse prevention policy established
- User account identifiers (email addresses) not reused after account deletion
- Identifier management procedure documents reuse prevention
- Database constraints prevent duplicate identifiers

**Status:** ✅ Fully Implemented

**Evidence:**
- `prisma/schema.prisma` (unique email constraint)
- Identifier Management Procedure: `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`
- Identifier Reuse Prevention Evidence: `../05-evidence/MAC-RPT-120_Identifier_Reuse_Prevention_Evidence.md`

---

### 8.4 Disable Identifiers After Inactivity (3.5.6)

**Requirement:** Disable identifiers after a defined period of inactivity.

**Implementation:**
- Account inactivity disable policy implemented
- Inactive account identification and disablement procedure established
- Account lifecycle management includes inactivity monitoring
- Inactive accounts automatically disabled after 180 days (6 months) of inactivity
- System tracks `lastLoginAt` timestamp for all users
- Automated process checks and disables inactive accounts
- Last active admin account protected from automatic disablement
- All disablement actions logged in audit trail

**Status:** ✅ Fully Implemented

**Evidence:**
- Inactivity disablement implementation: `lib/inactivity-disable.ts`
- Admin API endpoint: `app/api/admin/users/disable-inactive/route.ts`
- Account Lifecycle Enforcement Procedure: `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`
- Evidence document: `../05-evidence/MAC-RPT-122_3_5_6_disable_identifiers_after_inactivity_Evidence.md`
- Database schema: `prisma/schema.prisma` (User model with `lastLoginAt` field)

---

### 8.5 Password Reuse Prevention (3.5.8)

**Requirement:** Prohibit password reuse for a specified number of generations.

**Implementation:**
- Password reuse prevention implemented
- Password history tracking implemented (last 5 passwords)
- Password reuse policy enforced during password changes
- Password history stored in PasswordHistory model
- Password history checked during user password changes and admin password resets
- Old password history entries automatically cleaned up

**Status:** ✅ Fully Implemented

**Evidence:**
- Password change implementation: `app/api/auth/change-password/route.ts`
- Admin password reset: `app/api/admin/reset-user-password/route.ts`
- Password policy configuration: `lib/password-policy.ts` (passwordHistoryCount: 5)
- Database schema: `prisma/schema.prisma` (PasswordHistory model)
- Migration: `prisma/migrations/20260124000002_add_password_history/migration.sql`

---

## 9. Compliance Status

### 9.1 Level 1 Requirements (FCI)
- ✅ User identification (3.5.1)
- ✅ User authentication (3.5.2)
- ✅ Password complexity (3.5.7) - Enhanced for Level 2
- ✅ Cryptographically-protected passwords (3.5.10)
- ✅ Obscure authentication feedback (3.5.11)

### 9.2 Level 2 Requirements (CUI)
- ⚠️ MFA for privileged accounts (3.5.3) - Implementation in progress
- ✅ Replay-resistant authentication (3.5.4)
- ⚠️ Prevent identifier reuse (3.5.5) - Procedure to be enhanced
- ❌ Disable identifiers after inactivity (3.5.6) - To be implemented
- ✅ Password complexity (3.5.7) - Implemented
- ❌ Password reuse prevention (3.5.8) - To be implemented
- ✅ Temporary passwords (3.5.9) - Implemented
- ✅ Cryptographically-protected passwords (3.5.10)
- ✅ Obscure authentication feedback (3.5.11)

---

## 10. Related Documents

- User Account Provisioning Procedure: `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`
- Account Lifecycle Enforcement Procedure: `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`
- MFA Implementation Guide: `../06-supporting-documents/MAC-SEC-108_MFA_Implementation_Guide.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.2)
- POA&M Tracking Log: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`

---

## 11. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.0 (2026-01-23): **MAJOR UPGRADE - CMMC Level 2 to Level 2**
  - Upgraded from CMMC Level 2 to Level 2
  - Added MFA requirements (3.5.3)
  - Added replay-resistant authentication (3.5.4)
  - Added identifier reuse prevention (3.5.5)
  - Added identifier inactivity disable (3.5.6)
  - Added password reuse prevention (3.5.8)
  - Updated scope to include CUI
  - Preserved all Level 1 FCI requirements
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

## Appendix A: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Authentication System | `lib/auth.ts` |
| Password Hashing | `lib/auth.ts` (line 5), `app/api/auth/change-password/route.ts` (line 68) |
| Password Validation | `app/api/auth/change-password/route.ts` (lines 26-31) |
| Password Comparison | `lib/auth.ts` (lines 39-42) |
| User Model | `prisma/schema.prisma` (User model, lines 14-27) |
| Forced Password Change | `middleware.ts` (lines 35-38) |
| Session Management | `lib/auth.ts` (lines 59-94) |

## Appendix B: FAR 52.204-21 Mapping

| FAR Clause | Control | Implementation |
|------------|---------|----------------|
| 52.204-21(b)(1) | Unique user identification | Unique email addresses |
| 52.204-21(b)(1) | Password hashing | Bcrypt hashing (12 rounds) |
| 52.204-21(b)(1) | Authentication required | NextAuth.js authentication |
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-211-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-211-signoff.md`

