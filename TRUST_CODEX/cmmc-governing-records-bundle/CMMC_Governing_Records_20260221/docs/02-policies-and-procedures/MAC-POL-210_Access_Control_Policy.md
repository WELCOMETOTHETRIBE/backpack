# Access Control Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.1

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains access controls to ensure that only authorized personnel can access the system and Federal Contract Information (FCI) and Controlled Unclassified Information (CUI). Access is granted based on business need and is limited to the minimum necessary to perform job functions. This policy establishes requirements for access control, separation of duties, session management, remote access, and mobile device controls.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.1 (Access Control).

**Level 1 Continuity:** All Level 1 FCI protection requirements remain in effect and are preserved in this policy.

---

## 2. Scope

This policy applies to:
- All users of the MacTech Solutions system
- All system components (application, database, administrative interfaces)
- All Federal Contract Information (FCI) and Controlled Unclassified Information (CUI) stored or processed by the system
- All access methods (web interface, API endpoints)
- All remote access sessions
- All mobile device access
- All session management

---

## 3. Access Control Requirements

### 3.1 Authorized Users Only (FAR 52.204-21(b)(1))

**Requirement:** Only authorized personnel may access the system.

**Implementation:**
- All system access requires authentication
- Unauthenticated users are redirected to the sign-in page
- Admin routes are protected by middleware that checks for valid session
- Evidence: `middleware.ts` (lines 19-26)

**Enforcement:**
- Middleware intercepts all requests to protected routes
- Authentication status is verified on every request
- Evidence: `middleware.ts` (lines 5-43), `lib/auth.ts` (lines 7-95)

**Access Control Flow:**
1. User attempts to access protected route
2. Middleware checks for valid session (`req.auth`)
3. If no session exists, user is redirected to `/auth/signin`
4. If session exists, role-based access control is applied
5. Evidence: `middleware.ts` (lines 20-26)

---

### 3.2 No Shared Accounts (FAR 52.204-21(b)(1))

**Requirement:** Each user must have a unique account. Shared accounts are prohibited.

**Implementation:**
- User accounts are identified by unique email addresses
- Database schema enforces uniqueness constraint on email field
- Evidence: `prisma/schema.prisma` (User model, line 16: `email String @unique`)

**Enforcement:**
- Prisma ORM prevents duplicate email addresses at the database level
- User creation process validates email uniqueness before account creation
- Evidence: `app/api/admin/create-user/route.ts` (lines 28-37)

**User Account Structure:**
- Each user has a unique identifier (`id`)
- Each user has a unique email address
- Each user has an associated role (USER or ADMIN)
- Evidence: `prisma/schema.prisma` (User model, lines 14-27)

---

### 3.3 Least Privilege (FAR 52.204-21(b)(1))

**Requirement:** Users are granted only the minimum access necessary to perform their job functions.

**Implementation:**
- Role-based access control (RBAC) is implemented with two roles:
  - **ADMIN:** Full access to admin portal and system management functions
  - **USER:** Limited access (if implemented)
- Admin routes require ADMIN role
- Evidence: `middleware.ts` (lines 28-32)

**Role Enforcement:**
- Middleware checks user role before allowing access to admin routes
- Non-admin users attempting to access admin routes are redirected to home page
- Evidence: `middleware.ts` (lines 29-32)

**Access Control Matrix:**

| Resource | ADMIN Role | USER Role |
|----------|-----------|-----------|
| Admin Portal (`/admin/*`) | ✅ Full Access | ❌ Redirected |
| Public Pages | ✅ Access | ✅ Access |
| API Endpoints | ✅ Based on endpoint | ✅ Based on endpoint |

**Evidence:** `middleware.ts` (line 29: `session.user?.role !== "ADMIN"`)

---

### 3.4 Remote Access Control (FAR 52.204-21(b)(1))

**Requirement:** Remote access to the system is controlled and secured.

**Implementation:**
- All remote access occurs via HTTPS/TLS (inherited from Microsoft Azure / CUI enclave VM)
- Authentication is required for all remote access
- Session management via NextAuth.js with token-based session handling
- Evidence: `lib/auth.ts` (lines 59-60: `strategy: "jwt"`)

**Remote Access Methods:**
- Web browser access via HTTPS
- API endpoint access (requires authentication where applicable)
- All communications encrypted in transit via TLS

**Platform Security:**
- Microsoft Azure / CUI enclave VM provides network-level security
- Network security capabilities (inherited control, relied upon operationally, not independently assessed)
- Evidence: Microsoft Azure / CUI enclave VM configuration

---

### 3.5 Admin Route Protection

**Requirement:** Administrative functions are protected from unauthorized access.

**Implementation:**
- All routes beginning with `/admin` are protected
- Multi-layer protection:
  1. Authentication check (valid session required)
  2. Role check (ADMIN role required)
  3. Password change enforcement (if `mustChangePassword` flag is set)
- Evidence: `middleware.ts` (lines 19-40)

**Protection Flow:**
```
Request to /admin/* 
  → Check session exists (line 21)
    → If no session: Redirect to sign-in (lines 23-25)
    → If session exists: Check role (line 29)
      → If not ADMIN: Redirect to home (line 31)
      → If ADMIN: Check password change requirement (line 35)
        → If mustChangePassword: Redirect to change password (lines 36-38)
        → Otherwise: Allow access
```

**Evidence:** `middleware.ts` (lines 19-40)

---

## 4. Access Control Mechanisms

### 4.1 Authentication System

**Technology:** NextAuth.js with credentials provider

**Features:**
- Email/password authentication
- Authenticated access using NextAuth.js with token-based session handling
- Session validation on each request
- Evidence: `lib/auth.ts` (lines 7-95)

**Authentication Flow:**
1. User provides email and password
2. System validates credentials against database
3. Password is verified using bcrypt comparison
4. If valid, session token is created
5. Session token is used for subsequent requests
6. Evidence: `lib/auth.ts` (lines 18-56)

---

### 4.2 Middleware Protection

**Location:** `middleware.ts`

**Function:** Intercepts all requests and enforces access control

**Protection Scope:**
- All routes except:
  - Authentication pages (`/auth/*`)
  - Static files (`_next/static`, `_next/image`, etc.)
  - Public assets (images, etc.)
- Evidence: `middleware.ts` (lines 45-57)

**Enforcement Points:**
- Line 21: Session existence check
- Line 29: Role-based access check
- Line 35: Password change requirement check

---

### 4.3 Database-Level Controls

**User Model Constraints:**
- Unique email addresses enforced at database level
- Role field with default value
- Password field (encrypted, not plaintext)
- Evidence: `prisma/schema.prisma` (User model, lines 14-27)

**Access Control via Prisma:**
- ORM enforces data integrity
- Prevents unauthorized data access through type-safe queries
- Evidence: All database access via Prisma client

---

## 5. Access Control Procedures

### 5.1 User Account Creation

**Process:**
1. Account creation request is initiated with business justification
2. Request is reviewed and approved by authorized approver (see Account Lifecycle Enforcement)
3. Administrator creates user account via admin interface
4. System validates email uniqueness
5. Password is hashed using bcrypt (12 rounds)
6. User account is created with assigned role
7. User must complete User Access and FCI Handling Acknowledgement before access
8. Evidence: `app/api/admin/create-user/route.ts`

**Authorization:**
- Only existing ADMIN users can create new user accounts
- Account creation requires approval per Account Lifecycle Enforcement procedures
- Evidence: `app/api/admin/create-user/route.ts` (lines 10-16)

**Related Documents:**
- Account Lifecycle Enforcement (`MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`) - Approval process and revocation procedures
- User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`) - Required user acknowledgment

---

### 5.2 Access Revocation

**Process:**
- User accounts are revoked within 24 hours of revocation trigger (see Account Lifecycle Enforcement)
- Revocation triggers include: employee termination, role change, security incident, policy violation, business need elimination
- User accounts are deactivated or deleted by administrators via admin interface
- Immediate effect: User cannot authenticate after account modification
- Session tokens become invalid upon account changes

**Related Documents:**
- Account Lifecycle Enforcement (`Account_Lifecycle_Enforcement.md`) - Detailed revocation procedures, triggers, and timeframe

---

### 5.3 Password Change Enforcement

**Process:**
- Users with `mustChangePassword` flag set are required to change password on next login
- Users are redirected to password change page if flag is set
- Evidence: `middleware.ts` (lines 35-38)

**Enforcement:**
- Middleware checks `mustChangePassword` flag
- Redirects to `/auth/change-password` if flag is true
- Evidence: `middleware.ts` (lines 35-38)

---

## 6. Inherited Controls

### 6.1 Network Security (Microsoft Azure / CUI enclave VM)
- TLS/HTTPS encryption for all communications
- Network security capabilities (relied upon operationally, not independently assessed)
- **Status:** Inherited from Microsoft Azure / CUI enclave VM

### 6.2 Infrastructure Security (Microsoft Azure / CUI enclave VM)
- Physical security of data centers
- Environmental controls
- Facility access controls
- **Status:** Inherited from Microsoft Azure / CUI enclave VM

---

## 7. Compliance Risks & Open Items

### 7.1 Multi-Factor Authentication (MFA)
**Status:** ✅ MFA is fully implemented for privileged accounts (ADMIN role) as required by CMMC Level 2, Control 3.5.3. Implementation completed 2026-01-23. See evidence: `../05-evidence/MAC-RPT-104_MFA_Implementation_Evidence.md`

### 7.2 Session Timeout
**Status:** Session timeout configuration is managed by NextAuth.js default settings. Explicit session timeout policies may be implemented as a future enhancement.

### 7.3 Audit Logging of Access Events
**Status:** ✅ Comprehensive audit logging fully implemented. All access events, authentication events, admin actions, and security events are logged to the AppEvent table with 90-day minimum retention. See evidence: `../05-evidence/MAC-RPT-107_Audit_Log_Retention_Evidence.md` and `../05-evidence/MAC-RPT-107.md`

### 7.4 Non-Required Hardening Items (Out of Scope for Level 2)
The following items are not required for CMMC Level 2 but represent potential future enhancements:
- Rate limiting on API endpoints
- IP address whitelisting
- Geographic access restrictions

---

## 8. Level 2 Requirements (NIST SP 800-171 Rev. 2, Section 3.1)

### 8.1 Separation of Duties (3.1.4)

**Requirement:** Separate the duties of individuals to reduce the risk of malevolent activity without collusion.

**Implementation:**
- Separation of Duties Matrix established
- Administrative functions separated from audit functions
- User account management separated from security assessment
- System administration separated from security monitoring

**Separation Controls:**
- SoD matrix documents role conflicts and separation requirements
- Compensating controls implemented where full separation not possible
- Audit logs monitor for separation violations

**Evidence:**
- Separation of Duties Matrix: `MAC-SOP-235_Separation_of_Duties_Matrix.md`
- Access Control Policy: This document

**Status:** ⚠️ Partially Satisfied (SoD matrix created, separation enhanced per Phase 5)

---

### 8.2 Account Lockout (3.1.8)

**Requirement:** Limit unsuccessful logon attempts.

**Implementation:**
- ✅ Account lockout mechanism fully implemented (2026-01-23)
- ✅ Failed login attempts logged in audit system
- ✅ Account lockout policy defined: 5 failed attempts = 30 minute lockout
- ✅ Lockout parameters configured: Maximum 5 attempts, 30-minute lockout duration
- ✅ Implementation evidence: `../05-evidence/MAC-RPT-105_Account_Lockout_Implementation_Evidence.md`

**Lockout Configuration:**
- Maximum failed attempts: 5
- Lockout duration: 30 minutes
- Lockout release: Automatic after duration

**Evidence:**
- Account Lockout Procedure: `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md` (to be updated)
- Authentication system: `lib/auth.ts` (to be updated)

**Status:** ✅ Implemented

---

### 8.3 Session Management (3.1.10, 3.1.11)

**Requirement:** Use session lock with pattern-hiding displays and terminate sessions after defined conditions.

**Implementation:**
- Session lock policy established for browser-based access
- Users required to lock workstations/screens when away
- Automatic session termination after 8 hours of inactivity
- Session termination enforced by NextAuth.js

**Session Lock:**
- Browser-based session lock implemented via SessionLock component
- Automatic lock after 15 minutes of inactivity
- Pattern-hiding display: Lock screen obscures all content
- Warning displayed 2 minutes before lock
- User activity (mouse, keyboard, touch, scroll) resets timer
- Tab visibility changes monitored
- Session lock events logged in audit system
- Lock screen requires re-authentication to unlock

**Session Termination:**
- Automatic termination after 8 hours
- Session expiration enforced
- Session tokens invalidated after expiration

**Evidence:**
- Session Management: `lib/auth.ts` (8-hour expiration)
- Session Lock Implementation: `components/SessionLock.tsx`
- Session Lock Evidence: `../05-evidence/MAC-RPT-106_Session_Lock_Implementation_Evidence.md`

**Status:** ✅ Fully Implemented

---

### 8.4 Remote Access Controls (3.1.12-3.1.15)

**Requirement:** Monitor and control remote access sessions, employ cryptographic mechanisms, route via managed access control points, and authorize remote execution of privileged commands.

**Implementation:**
- All system access is remote (cloud-based application)
- Remote access sessions monitored via audit logging
- Remote access encrypted via HTTPS/TLS (inherited)
- Remote access routed through Microsoft Azure / CUI enclave VM (inherited)
- Privileged command execution restricted to ADMIN role

**Remote Access Architecture:**
- All access via internet (HTTPS)
- Microsoft Azure / CUI enclave VM manages access control points
- TLS encryption for all remote access
- Session monitoring via audit logs

**Evidence:**
- Network architecture: Microsoft Azure / CUI enclave VM (inherited)
- Audit logs: Remote access sessions logged
- TLS encryption: Microsoft Azure / CUI enclave VM (inherited)

**Status:** ✅ Implemented (remote access is primary access method)

---

### 8.5 Mobile Device Controls (3.1.18-3.1.19)

**Requirement:** Control connection of mobile devices and encrypt CUI on mobile devices.

**Implementation:**
- System is cloud-based web application accessible via any device
- Mobile device access controlled via authentication requirements
- Mobile device policy established
- CUI stored in cloud database (StoredCUIFile table) with password protection
- No local CUI storage on mobile devices (browser-based access only)

**Mobile Device Access:**
- Mobile devices access system via browser
- Same authentication requirements as desktop
- No local CUI storage on mobile devices
- CUI encryption at rest in CUI vault on Microsoft Azure (FIPS-validated)
- CUI files require password protection for access

**Evidence:**
- Mobile Device Policy: This policy (to be enhanced)
- System architecture: Cloud-based, no local CUI storage
- CUI file storage: `lib/file-storage.ts` (storeCUIFile function)
- CUI password protection: `lib/file-storage.ts` (verifyCUIPassword function)

**Status:** ✅ Implemented (mobile devices access via same authentication, CUI stored in cloud with password protection, no local CUI storage)

---

### 8.6 Portable Storage Controls (3.1.21)

**Requirement:** Limit use of portable storage devices on external systems.

**Implementation:**
- Portable storage device policy established
- No portable storage devices used for CUI
- All CUI stored in cloud database
- Portable storage restrictions documented

**Evidence:**
- Portable Storage Policy: To be enhanced
- Media Protection Policy: `MAC-POL-213_Media_Handling_Policy.md` (to be updated)

**Status:** ⚠️ Partially Satisfied (policy to be enhanced per Phase 7)

---

## 9. Compliance Status

### 9.1 Level 1 Requirements (FCI)
- ✅ Authorized users only (3.1.1)
- ✅ Transaction/function limits (3.1.2)
- ✅ External system connections (3.1.20)
- ✅ Public system controls (3.1.22)
- ✅ Least privilege (3.1.5)

### 9.2 Level 2 Requirements (CUI)
- ✅ Limit system access (3.1.1)
- ✅ Transaction/function limits (3.1.2)
- ✅ Control CUI flow (3.1.3)
- ⚠️ Separation of duties (3.1.4) - Matrix created, separation enhanced
- ✅ Least privilege (3.1.5)
- ✅ Non-privileged accounts (3.1.6)
- ✅ Prevent privileged function execution (3.1.7)
- ✅ Account lockout (3.1.8)
- ✅ Privacy/security notices (3.1.9)
- ⚠️ Session lock (3.1.10) - Policy to be enhanced
- ✅ Session termination (3.1.11)
- ✅ Remote access monitoring (3.1.12)
- ✅ Remote access encryption (3.1.13)
- ✅ Managed access control points (3.1.14)
- ✅ Authorize remote privileged commands (3.1.15)
- 🚫 Wireless access authorization (3.1.16-3.1.17) - Not applicable
- ✅ Mobile device controls (3.1.18-3.1.19)
- ✅ External system connections (3.1.20)
- ⚠️ Portable storage controls (3.1.21) - Policy to be enhanced
- ✅ Control CUI on public systems (3.1.22)

---

## 10. Related Documents

- Separation of Duties Matrix: `MAC-SOP-235_Separation_of_Duties_Matrix.md`
- Account Lifecycle Enforcement Procedure: `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`
- User Account Provisioning Procedure: `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.1)
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
  - Added separation of duties requirements (3.1.4)
  - Added account lockout requirements (3.1.8)
  - Added session management requirements (3.1.10-3.1.11)
  - Added remote access controls (3.1.12-3.1.15)
  - Added mobile device controls (3.1.18-3.1.19)
  - Added portable storage controls (3.1.21)
  - Updated scope to include CUI
  - Preserved all Level 1 FCI requirements
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

## Appendix A: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Authentication | `lib/auth.ts` |
| Middleware Protection | `middleware.ts` (lines 19-40) |
| Role-Based Access | `middleware.ts` (line 29) |
| User Model | `prisma/schema.prisma` (User model, lines 14-27) |
| User Creation | `app/api/admin/create-user/route.ts` |
| Session Management | `lib/auth.ts` (lines 59-94) |

## Appendix B: FAR 52.204-21 Mapping

| FAR Clause | Control | Implementation |
|------------|---------|----------------|
| 52.204-21(b)(1) | Authorized users only | Middleware authentication check |
| 52.204-21(b)(1) | No shared accounts | Unique email constraint |
| 52.204-21(b)(1) | Least privilege | Role-based access control |
| 52.204-21(b)(1) | Remote access control | HTTPS/TLS, authentication required |
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-210-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-210-signoff.md`

