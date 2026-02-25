# System Description and Architecture - CMMC Level 2

**Document Version:** 2.1  
**Date:** 2026-01-27  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. System Purpose

The MacTech Solutions system is a web-based federal contract opportunity management and capture platform. The system enables authorized personnel to discover, analyze, and manage federal contracting opportunities from SAM.gov and related government procurement sources.

**Primary Functions:**
- Discovery and ingestion of federal contract opportunities from SAM.gov
- Storage and analysis of Federal Contract Information (FCI) and Controlled Unclassified Information (CUI)
- Contract opportunity scoring and relevance assessment
- Award history tracking via USAspending.gov integration
- Administrative portal for authorized users
- CUI file storage and password-protected access

---

## 2. Federal Contract Information (FCI) and Controlled Unclassified Information (CUI) Handling

### 2.1 Federal Contract Information (FCI)

Only non-public information related to government contracts is treated as FCI. Publicly released information (e.g., SAM.gov postings, USAspending.gov data) is not FCI unless combined with internal, non-public data.

The system handles:
- **Non-public contract opportunity data** received, generated, or stored internally
- **Internal analysis and annotations** related to contract opportunities
- **User-generated content** that combines public data with internal, non-public information
- **Derived data** generated from internal processing of contract information

**Important:** Publicly available data from SAM.gov and USAspending.gov APIs is not FCI by itself. FCI exists only when such data is combined with internal, non-public information or when the system receives, generates, or stores non-public contract-related information.

**FCI and CUI Boundary:** See `MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md` for explicit FCI and CUI definition, prohibited data types, and data boundary enforcement.

### 2.2 Controlled Unclassified Information (CUI)

The system processes, stores, and manages Controlled Unclassified Information (CUI) as defined by 32 CFR Part 2002 and the CUI Registry.

**CUI Handling:**
- CUI files are handled via a **direct-to-vault** model: the **CUI workspace browser (Windows Server 2025 CUI Workspace VM)** uploads/downloads CUI bytes directly to/from the dedicated CUI vault.
- other systems (outside CUI boundary) stores **CUI metadata only** in `StoredCUIFile` (e.g., vaultId, size, mimeType, owner, timestamps) and enforces access control and audit logging.
- CUI keyword detection is used for spill prevention (to prevent misrouting CUI bytes to non-CUI endpoints).
- CUI access attempts are logged to the audit log.

**CUI Storage:**
- Primary CUI storage: Dedicated CUI vault infrastructure on Microsoft Azure (<vault-domain>)
- CUI vault provides isolated, encrypted storage for CUI records using AES-256-GCM encryption with FIPS-validated cryptography (CMVP Certificate #4794)
- **Vault Requirement:** CUI vault is required for all new CUI file uploads. If vault unavailable, upload is rejected (no fallback to other systems (outside CUI boundary) storage).
- Metadata and legacy files: external systems (outside CUI boundary) `StoredCUIFile` table (for backward compatibility and file metadata only)
- **other systems (outside CUI boundary) Role:** other systems (outside CUI boundary) is outside the CUI security boundary. other systems (outside CUI boundary) functions as a transmission medium for routing CUI to vault, but does not store CUI content.
- No CUI stored on removable media
- CUI access controlled via authentication and vault token issuance (no other systems (outside CUI boundary) password verification)

**CUI Processing:**
- CUI uploads use a direct-to-vault flow. other systems (outside CUI boundary) issues short-lived tokens (metadata only); browser uploads bytes to vault.
- System auto-detects CUI keywords only to **block** CUI on `/api/files/upload` (no CUI bytes accepted on other systems (outside CUI boundary)).
- CUI files stored separately from FCI files (vault for bytes; other systems (outside CUI boundary) for metadata).
- CUI access requires authentication and vault-issued view tokens (no password verification on other systems (outside CUI boundary)).

### 2.3 FCI and CUI Storage

**FCI Storage:**
- All FCI is stored in a PostgreSQL database hosted on other systems (outside CUI boundary) cloud platform
- No FCI is stored on removable media
- Source code and system documentation are stored in GitHub repositories

**CUI Storage:**
- Primary CUI storage: Dedicated CUI vault infrastructure on Microsoft Azure (<vault-domain>)
- CUI vault provides isolated, encrypted storage for CUI records using AES-256-GCM encryption with FIPS-validated cryptography (CMVP Certificate #4794)
- **Vault Requirement:** CUI vault is required for all new CUI file uploads. If vault unavailable, upload is rejected (no fallback to other systems (outside CUI boundary) storage).
- Metadata and legacy files: external systems (outside CUI boundary) `StoredCUIFile` table (for backward compatibility and file metadata only)
- **other systems (outside CUI boundary) Role:** other systems (outside CUI boundary) is outside the CUI security boundary. other systems (outside CUI boundary) terminates TLS for metadata and token issuance only, not for CUI bytes. CUI bytes flow directly between browser and vault.
- CUI access uses vault view tokens; other systems (outside CUI boundary) does not handle CUI bytes.
- No CUI stored on removable media

**FCI and CUI Processing:**
- FCI is ingested via automated processes from public government APIs (SAM.gov, USAspending.gov)
- CUI is uploaded by users via direct-to-vault flow (upload-session token from other systems (outside CUI boundary); bytes sent to vault)
- FCI and CUI are processed, analyzed, and stored for authorized user access
- All FCI and CUI access is restricted to authenticated users with appropriate authorization

---

## 3. System Boundary

The system boundary encompasses the following components:

### In-Scope Components

1. **Next.js Web Application**
   - Location: other systems (outside CUI boundary) cloud platform
   - Technology: Next.js 14 (TypeScript), React
   - Purpose: User interface and business logic

2. **PostgreSQL Database**
   - Location: other systems (outside CUI boundary) cloud platform
   - Purpose: Storage of FCI, user accounts, and system data
   - Evidence: `prisma/schema.prisma`

3. **Authentication System**
   - Technology: NextAuth.js with credentials provider
   - Purpose: User identification and authentication
   - Evidence: `lib/auth.ts`

4. **GitHub Repository**
   - Purpose: Source code version control and documentation storage
   - Access: Restricted to authorized personnel

5. **other systems (outside CUI boundary) Hosting Infrastructure**
   - Purpose: Application and database hosting
   - Security: Inherited controls (see Section 4)

6. **CUI Workspace (endpoint operating system Boundary VM)**
   - Purpose: Primary user workspace for handling CUI in a controlled endpoint environment
   - Notes: Browser on this workstation performs direct-to-vault upload/view; workstation access is controlled and monitored per policy and enclave configuration

### Out-of-Scope Components

- Developer workstations and local development environments
- Third-party services accessed by the application (SAM.gov API, USAspending API)
- Unmanaged end-user browsers and client devices (outside the approved CUI workspace)

---

## 4. Inherited Controls

The following security controls are inherited from the other systems (outside CUI boundary) cloud platform:

### 4.1 TLS/HTTPS Encryption
- **Control:** All network communications are encrypted using TLS
- **Provider:** other systems (outside CUI boundary) (automatic HTTPS)
- **Evidence:** Network and application configuration (outside CUI boundary)
- **Coverage:** All data in transit between clients and the application

### 4.2 Physical Security
- **Control:** Physical security of data center facilities
- **Provider:** other systems (outside CUI boundary) (hosted on cloud infrastructure)
- **Coverage:** Physical access controls, environmental controls, facility security

### 4.3 Infrastructure Security
- **Control:** Network security capabilities
- **Provider:** other systems (outside CUI boundary)
- **Coverage:** Security capabilities are relied upon operationally from the service provider but are not independently assessed as part of this CMMC Level 1 self-assessment

### 4.4 Database Security
- **Control:** Database security capabilities
- **Provider:** external systems (outside CUI boundary) service
- **Coverage:** Security capabilities are relied upon operationally from the service provider but are not independently assessed as part of this CMMC Level 1 self-assessment

### 4.5 Network Segmentation
- **Control:** Network infrastructure and logical network segmentation
- **Provider:** other systems (outside CUI boundary)
- **Coverage:** other systems (outside CUI boundary) provides network infrastructure with logical separation between publicly accessible system components (application tier) and internal network components (database tier)
- **Architecture:** 
  - Public-facing application tier (Next.js) operates in a publicly accessible network segment
  - Internal database tier (PostgreSQL) operates in an internal network segment with controlled access
  - Network boundaries and access controls are managed by other systems (outside CUI boundary)
- **Evidence:** other systems (outside CUI boundary) network architecture, logical separation of application and database services

**Note:** These inherited controls satisfy certain CMMC Level 1 requirements. The organization relies on other systems (outside CUI boundary) for these controls. See inherited control statements for systems outside the CUI boundary for detailed inherited control statement.

---

## 5. System Architecture

### 5.1 Application Layer
- **Framework:** Next.js 14 with App Router
- **Language:** TypeScript
- **Authentication:** NextAuth.js with credentials provider
- **Session Management:** Token-based session handling via NextAuth.js
- **Evidence:** `lib/auth.ts`, `middleware.ts`

### 5.2 Data Layer
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Schema Location:** `prisma/schema.prisma`
- **FCI Models:** `GovernmentContractDiscovery`, `UsaSpendingAward`, `OpportunityAwardLink`

### 5.3 Access Control
- **Role-Based Access Control (RBAC):** USER and ADMIN roles
- **Admin Route Protection:** Middleware-based enforcement
- **Evidence:** `middleware.ts` (lines 19-40), `lib/auth.ts` (line 19)

### 5.4 Deployment
- **Platform:** other systems (outside CUI boundary) (cloud PaaS)
- **Configuration:** `railway.json`, `Procfile`
- **Database:** external systems (outside CUI boundary) service
- **Environment:** Production environment on other systems (outside CUI boundary) infrastructure

### 5.5 Network Architecture
- **Network Segmentation:** other systems (outside CUI boundary) provides logical network separation
- **Public Tier:** Next.js application operates in publicly accessible network segment
  - Accepts HTTPS connections from internet
  - Handles user authentication and application logic
  - No direct database access from internet
- **Internal Tier:** PostgreSQL database operates in internal network segment
  - Accessible only from application tier via other systems (outside CUI boundary)-managed network
  - Not directly accessible from internet
  - Encrypted connections between application and database
- **Network Boundaries:** other systems (outside CUI boundary) manages network boundaries and access controls
- **Evidence:** other systems (outside CUI boundary) architecture, logical separation of services

---

## 6. User Access

### 6.1 Authorized Users
- System access is restricted to authorized personnel only
- All users must have unique accounts (no shared accounts)
- User accounts are created and managed by administrators
- Evidence: `prisma/schema.prisma` (User model, lines 14-27)

### 6.2 Authentication Requirements
- All users must authenticate using email and password
- Passwords are hashed using bcrypt (12 rounds)
- Minimum password length: 14 characters
- Evidence: `lib/password-policy.ts` (PASSWORD_POLICY.minLength: 14), `app/api/auth/change-password/route.ts` (uses validatePassword())

### 6.3 Role-Based Access
- **ADMIN role:** Full access to admin portal and system management functions
- **USER role:** Limited access (if implemented)
- Admin routes are protected by middleware
- Evidence: `middleware.ts` (line 29)

---

## 7. Compliance Risks & Open Items

### 7.1 File Upload Storage
**Risk Description:** Uploaded files are currently stored locally within the application runtime in `/public/uploads/` directory. These files are limited to non-sensitive content and are not FCI.

**Mitigation:**
- No removable media is used for file storage
- Files are stored within the application runtime environment
- Future architectural changes may migrate uploads to managed cloud storage

**Status:** Acceptable for Level 1 compliance; enhancement opportunity for future architecture

### 7.2 Multi-Factor Authentication (MFA)
**Status:** MFA is not implemented. MFA is not required for CMMC Level 1 compliance but represents a security enhancement opportunity.

### 7.3 Audit Logging
**Status:** Formal audit logging system is not implemented. Application logs are available through other systems (outside CUI boundary) logging. Enhanced audit logging may be implemented as a future enhancement.

### 7.4 Non-Required Hardening Items (Out of Scope for Level 1)
The following items are not required for CMMC Level 1 but represent potential future enhancements:
- Rate limiting on API endpoints
- Explicit security headers configuration
- Automated vulnerability scanning
- Cloud-based file storage migration

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---

## 8. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.1 (2026-01-27): Updated CUI storage descriptions to clarify primary storage is CUI vault on Microsoft Azure, other systems (outside CUI boundary) table is for metadata/backward compatibility only
- Version 2.0 (2026-01-24): Updated from CMMC Level 1 to Level 2, updated scope to FCI and CUI, updated references to NIST SP 800-171 Rev. 2, added CUI handling sections
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 1

---

## Appendix A: Evidence Locations

| Control Area | Evidence Location |
|-------------|------------------|
| Authentication | `lib/auth.ts` |
| Access Control | `middleware.ts` (lines 19-40) |
| Password Handling | `app/api/auth/change-password/route.ts` (lines 26-31, 68) |
| Database Schema | `prisma/schema.prisma` (User model, lines 14-27) |
| FCI Storage | `prisma/schema.prisma` (GovernmentContractDiscovery model) |
| Deployment Config | `railway.json`, `Procfile` |
| Role-Based Access | `middleware.ts` (line 29), `lib/auth.ts` (line 19) |
