# System Boundary & Data Handling Statement - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Scope Statement

**FCI and CUI Processing**

**Level 1 (FCI):** This system processes and stores **Federal Contract Information (FCI)**, as defined by FAR 52.204-21. Only non-public information related to government contracts is treated as FCI. Publicly released information (e.g., SAM.gov postings) is not FCI unless combined with internal, non-public data.

**Level 2 (CUI):** This system has been upgraded to also process and store **Controlled Unclassified Information (CUI)**, as defined by 32 CFR Part 2002 and the CUI Registry. CUI is handled according to established CUI handling procedures and security controls.

**System Scope:** The system processes both FCI and CUI. FCI handling remains as documented in Level 1. CUI handling is added per Level 2 requirements. All security controls protect both FCI and CUI unless otherwise specified.

**CUI Boundary (Assessed):** The CUI security boundary assessed for CMMC Level 2 is **only** the **Windows Server 2025 VM on Microsoft Azure** (CUI enclave). CUI is stored and processed solely on this VM (vault, workspace, and evidence collection). All other systems (web applications, databases, other hosting) are outside the CUI boundary and are not in scope for CUI control assessment.

---

## 2. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│          CUI Workspace (Windows Server 2025 CUI Workspace VM Browser) (HTTPS)          │
│  - Authenticated access via NextAuth.js                      │
│  - Security headers enforced                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/TLS (other systems (outside CUI boundary) - metadata/token only)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│     PUBLIC NETWORK SEGMENT (other systems (outside CUI boundary))                │
│          Next.js Application (Public Tier)                   │
│  - Authentication & Authorization                           │
│  - Input validation & CUI blocking                           │
│  - Event logging                                             │
│  - File upload handling                                      │
│  - Publicly accessible network segment                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ Encrypted Connection (Internal Network)
                       │ Network Boundary (other systems (outside CUI boundary) Managed)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│     INTERNAL NETWORK SEGMENT (other systems (outside CUI boundary))              │
│         PostgreSQL Database (Internal Tier)                  │
│  - FCI storage (GovernmentContractDiscovery, etc.)          │
│  - CUI metadata (StoredCUIFile table - metadata only)        │
│  - User accounts & authentication                            │
│  - Event logs (AppEvent table)                               │
│  - File storage (StoredFile table - BYTEA)                  │
│  - Database security capabilities (other systems (outside CUI boundary) managed)          │
│  - Not directly accessible from internet                      │
│  - Note: CUI content is NOT stored here (vault-only)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS/TLS 1.3 (API Key Auth)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│     CUI VAULT (Microsoft Azure (CUI enclave VM))                        │
│         <vault-domain>                        │
│  - Dedicated CUI storage infrastructure                     │
│  - PostgreSQL database (localhost only)                     │
│  - AES-256-GCM encrypted CUI records                         │
│  - API key authentication                                    │
│  - TLS 1.3 encryption (AES-256-GCM-SHA384)                   │
└─────────────────────────────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              File Access (Signed URLs)                       │
│  - Files accessible via signed URLs with expiration          │
│  - Access logged in AppEvent table                           │
└─────────────────────────────────────────────────────────────┘
       │
       │ Direct HTTPS/TLS for CUI bytes (Vault only)
       ▼
┌─────────────────────────────────────────────────────────────┐
│     CUI VAULT (Microsoft Azure (CUI enclave VM))                        │
│  - TLS terminates for CUI upload/download                    │
│  - CUI bytes never transit other systems (outside CUI boundary)                           │
└─────────────────────────────────────────────────────────────┘
```

**CUI Byte Boundary Note:** other systems (outside CUI boundary) terminates TLS for metadata and token issuance only, not for CUI bytes. CUI file upload/download occurs directly between the **CUI workspace browser (Windows Server 2025 CUI Workspace VM)** and the vault; TLS for CUI payloads terminates on the vault host.

**Network Segmentation:**
- **Public Network Segment:** Next.js application operates in publicly accessible network tier (accepts HTTPS from internet)
- **Internal Network Segment:** PostgreSQL database operates in internal network tier (not directly accessible from internet)
- **Network Boundary:** other systems (outside CUI boundary) manages network boundaries and access controls between tiers
- **Logical Separation:** Application and database are logically separated in different network segments

---

## 3. File Storage Location and Access Method

### 3.1 Storage Location

**Primary Storage:** PostgreSQL database (other systems (outside CUI boundary))
- FCI data: Stored in database tables (GovernmentContractDiscovery, UsaSpendingAward, etc.)
- Files: Stored in `StoredFile` table using BYTEA column (PostgreSQL binary data type)
- **No local file system storage** (replaces previous `/public/uploads/` approach)

### 3.2 Access Method

**File Access:**
- Files are stored in database as binary data (BYTEA)
- Files are accessible only via signed URLs with expiration
- Signed URLs are generated using HMAC-SHA256 with secret key
- Default expiration: 1 hour
- Access is logged in AppEvent table

**Database Access:**
- Direct database access is restricted to application layer
- All database access requires authentication
- Database connection is encrypted (other systems (outside CUI boundary) managed)

---

## 4. Public Content Separation from FCI

### 4.1 Public Content Control

**PublicContent Model:**
- Public content requires ADMIN approval before being visible
- Approval is logged in AppEvent table
- Public content is stored separately from FCI

**Implementation:**
- Any content marked "public" requires `isPublic = true` flag
- `approvedBy` and `approvedAt` fields track approval
- Approval workflow is logged

### 4.2 FCI vs Public Content

**FCI (In-Scope):**
- Contract opportunities from SAM.gov
- Opportunity metadata
- Contract-related administrative data
- Historical award data from USAspending.gov

**Public Content (Out-of-Scope for FCI Protection):**
- Public-facing website content
- Marketing materials
- Public blog posts (if any)
- **Note:** Public content approval control is implemented but public content is not FCI

---

## 5. System Components

### 5.1 In-Scope Components

1. **Next.js Web Application**
   - Location: other systems (outside CUI boundary) cloud platform
   - Technology: Next.js 14 (TypeScript), React
   - Purpose: User interface and business logic
   - Evidence: `app/`, `components/`, `lib/`

2. **PostgreSQL Database**
   - Location: other systems (outside CUI boundary) cloud platform
   - Purpose: Storage of FCI, CUI metadata, user accounts, event logs, files
   - FCI files: StoredFile table
   - CUI metadata: StoredCUIFile table (metadata only, CUI content stored in vault)
   - **Note:** other systems (outside CUI boundary) is outside the CUI security boundary. other systems (outside CUI boundary) database stores CUI metadata only, not CUI content.
   - Evidence: `prisma/schema.prisma`, other systems (outside CUI boundary)

3. **Authentication System**
   - Technology: NextAuth.js with credentials provider
   - Purpose: User identification and authentication
   - Evidence: `lib/auth.ts`

4. **File Storage System**
   - Technology: PostgreSQL BYTEA column
   - Purpose: Secure file storage with signed URLs
   - FCI files: StoredFile table
   - CUI files: StoredCUIFile table (password protected)
   - Evidence: `lib/file-storage.ts`, `prisma/schema.prisma` (StoredFile, StoredCUIFile models)

5. **Event Logging System**
   - Technology: PostgreSQL table (AppEvent)
   - Purpose: Application event logging for audit trail
   - Evidence: `lib/audit.ts`, `prisma/schema.prisma` (AppEvent model)

6. **GitHub Repository**
   - Purpose: Source code version control
   - Access: Restricted to authorized personnel
   - Evidence: GitHub repository

7. **CUI Workspace (endpoint operating system Boundary VM)**
   - Purpose: Primary user workspace for handling CUI in a controlled endpoint environment
   - Notes: Browser on this workstation performs direct-to-vault upload/view; workstation access is controlled and monitored per policy and enclave configuration
   - Evidence: Enclave connectivity and firewall controls (`docs/ENCLAVE_VM_CONNECTIVITY.md`, `MAC-RPT-128_CUI_Vault_Network_Security_Evidence.md`)

### 5.2 Out-of-Scope Components

- **Developer workstations** - Local development environments
- **Third-party services** - SAM.gov API, USAspending.gov API (read-only, public APIs)
- **Unmanaged end-user browsers/devices** - Client-side devices outside the approved CUI workspace
- **other systems (outside CUI boundary) infrastructure** - Physical security, network infrastructure (inherited controls)

### 5.3 Network Architecture

**Network Segmentation (FAR 52.204-21(b)(1)(xi)):**
- other systems (outside CUI boundary) provides network infrastructure with logical network segmentation
- **Public Network Segment:** Next.js application operates in publicly accessible network tier
  - Accepts HTTPS connections from internet
  - Handles user authentication and application logic
  - No direct database access from internet
- **Internal Network Segment:** PostgreSQL database operates in internal network tier
  - Accessible only from application tier via other systems (outside CUI boundary)-managed network
  - Not directly accessible from internet
  - Encrypted connections between application and database
- **Network Boundaries:** other systems (outside CUI boundary) manages network boundaries and access controls between tiers
- **Logical Separation:** Application and database are logically separated in different network segments

**Evidence:** other systems (outside CUI boundary) network architecture, logical separation of application and database services. See Inherited Controls documentation for detailed reliance statement.

---

## 6. Data Handling

### 6.1 FCI Data Types

**FCI Stored in System:**
- Non-public contract opportunity data received, generated, or stored internally
- Internal analysis, annotations, and derived data related to contract opportunities
- User-generated content that combines public data with internal, non-public information

**Note:** Publicly available data from SAM.gov and USAspending.gov is not FCI by itself. FCI exists only when such data is combined with internal, non-public information.

### 6.2 CUI Data Types

**CUI Stored in System:**
- Controlled Unclassified Information (CUI) as defined by 32 CFR Part 2002 and the CUI Registry
- Contract proposals, Statements of Work (SOWs), and contract documentation containing CUI
- CUI metadata stored in separate `StoredCUIFile` table (other systems (outside CUI boundary)) with vault reference (`vaultId`) for vault-stored files
- CUI handled according to established CUI handling procedures

**CUI Handling:**
- CUI files stored separately from FCI files
- CUI file bytes are stored and protected in the dedicated CUI vault; other systems (outside CUI boundary) stores metadata only for vault-stored files
- CUI keyword detection is used to prevent misrouting of CUI bytes to non-CUI upload paths (spill prevention)
- User acknowledgment required for CUI handling (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`)
- Procedural controls and training

**CUI Security Boundary:**
- **other systems (outside CUI boundary) is not part of the CUI security boundary.** other systems (outside CUI boundary) does not process, store, decrypt, or terminate CUI. other systems (outside CUI boundary) functions solely as a pass-through transport layer for encrypted data. All cryptographic operations protecting CUI in transit are performed using FIPS-validated cryptographic modules within the CUI Vault enclave.
- CUI content storage is vault-only (FIPS-validated cryptography required)
- other systems (outside CUI boundary) database stores CUI metadata only, not CUI content
- CUI vault is required for all new CUI file uploads (no fallback to other systems (outside CUI boundary) storage)

**Prohibited Data Types:**
- Classified information
- PII beyond publicly available FCI (unless part of CUI)
- Any data not directly related to federal contract opportunity management

---

## 7. Evidence Locations

| Component | Evidence Location |
|-----------|------------------|
| Application Code | `app/`, `components/`, `lib/` |
| Database Schema | `prisma/schema.prisma` |
| File Storage | `lib/file-storage.ts`, `prisma/schema.prisma` (StoredFile model) |
| Event Logging | `lib/audit.ts`, `prisma/schema.prisma` (AppEvent model) |
| Authentication | `lib/auth.ts`, `middleware.ts` |
| CUI Blocking | `lib/cui-blocker.ts` |
| Security Headers | `lib/security-headers.ts`, `next.config.js` |

---

## 8. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.0 (2026-01-23): **MAJOR UPGRADE - CMMC Level 1 to Level 2**
  - Upgraded from CMMC Level 1 to Level 2
  - Added CUI scope and data handling
  - Updated system boundary to include CUI
  - Preserved all Level 1 FCI statements
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 1

---

## Appendix A: Related Documents

- Evidence Index (`../05-evidence/MAC-RPT-100_Evidence_Index.md`)
- Inherited Controls Matrix (`../03-control-responsibility/MAC-RPT-102_Inherited_Controls_Matrix.md`)
- Internal Audit Checklist (`../04-self-assessment/MAC-AUD-103_Internal_Audit_Checklist.md`)
- FCI Scope and Data Boundary Statement (`MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md`)
