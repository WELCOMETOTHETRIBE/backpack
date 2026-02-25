# Media Handling & Data Disposal Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains controls over media handling and data disposal to protect Federal Contract Information (FCI) and Controlled Unclassified Information (CUI). This policy establishes requirements for media usage, data storage, and secure data disposal procedures.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2.

---

## 2. Scope

This policy applies to:
- All media used to store or process FCI and CUI
- All data storage mechanisms (database, file systems, cloud storage)
- All data disposal and deletion procedures
- All personnel who handle FCI and CUI

---

## 3. Media Usage

### 3.1 Removable Media and Portable Storage (FAR 52.204-21(b)(2), NIST 3.1.21)

**Requirement:** Removable media and portable storage devices must be properly handled and protected. Use of portable storage devices on external systems must be limited.

**Implementation:**
- **No removable media is used** for storing FCI or CUI
- All FCI and CUI is stored in cloud-based PostgreSQL database
- No USB drives, external hard drives, or other removable media are used for FCI/CUI storage
- Source code is stored in GitHub (cloud-based version control)
- Browser-based restrictions prevent unauthorized file downloads

**FCI/CUI Storage Locations:**
- PostgreSQL database (other systems (outside CUI boundary) cloud platform)
- No local file storage of FCI/CUI
- No removable media storage of FCI/CUI
- No portable storage device access to FCI/CUI

**Browser-Based Restrictions:**
- System is accessed via web browser only
- No direct file system access to FCI/CUI data
- Export functions require authentication and authorization
- CSV exports are generated on-demand and do not persist locally
- No automatic file downloads of FCI/CUI data
- User agreements prohibit use of portable storage for FCI/CUI

**Technical Controls:**
- Application does not provide direct file system access
- All data access is through authenticated web interface
- Export functions generate temporary files (not stored locally)
- Database access restricted to application layer
- No local caching of sensitive data

**User Requirements:**
- All users must complete User Access and FCI/CUI Handling Acknowledgement before system access
- Users must properly mark CUI files during upload
- Users must use approved authentication + MFA and approved application workflows for any CUI handling (direct-to-vault upload/view)
- Users are procedurally required to protect FCI/CUI and not use removable media
- Users must not download FCI/CUI to portable storage devices
- Users must not access system from devices with portable storage enabled (if policy requires)

**Portable Storage Device Restrictions:**
- No portable storage devices (USB drives, external hard drives, SD cards) may be used to store FCI/CUI
- System does not support direct file transfers to portable storage
- Export functions generate temporary files that must be handled securely
- Users must not copy FCI/CUI data to portable storage devices
- Workstations accessing system should have portable storage disabled or restricted (organizational policy)

**Evidence:**
- Database schema: `prisma/schema.prisma`
- FCI/CUI models: `GovernmentContractDiscovery`, `UsaSpendingAward`, `OpportunityAwardLink`
- FCI stored in external systems (outside CUI boundary); CUI bytes stored in dedicated vault; CUI metadata stored in external systems (outside CUI boundary)
- Browser-based access only (no direct file system access)
- Export functions: `/api/admin/events/export`, `/api/admin/physical-access-logs/export`

**Related Documents:**
- User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`) - Required user acknowledgment
- FCI Scope and Data Boundary Statement (`../01-system-scope/MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md`) - Prohibited data types and boundary enforcement
- Portable Storage Controls Evidence: `../05-evidence/MAC-RPT-118_Portable_Storage_Controls_Evidence.md`

---

### 3.2 Cloud-Based Storage

**Primary Storage:** PostgreSQL database hosted on other systems (outside CUI boundary) cloud platform

**Source Code Storage:** GitHub repositories (cloud-based)

**File Storage:**\n+- Non-CUI/FCI file uploads are stored in the external systems (outside CUI boundary) database (`StoredFile`).\n+- CUI file bytes are stored in the dedicated CUI vault (<vault-domain>); other systems (outside CUI boundary) stores metadata only for vault-stored CUI files.

**No Removable Media:** All data storage is cloud-based or within application runtime

---

### 3.3 Source Code Storage

**Location:** GitHub repositories

**Access:** Restricted to authorized personnel

**Version Control:** Git-based version control system

**Backup:** GitHub provides repository backup and redundancy

**Evidence:** Source code is managed via Git and stored in GitHub

---

## 4. Data Storage

### 4.1 Database Storage

**Technology:** PostgreSQL database

**Location:** other systems (outside CUI boundary) cloud platform

**FCI Storage:**
- All FCI is stored in PostgreSQL database
- Database tables for FCI:
  - `GovernmentContractDiscovery`: SAM.gov opportunities
  - `UsaSpendingAward`: Historical award data
  - `OpportunityAwardLink`: Links between opportunities and awards
- Evidence: `prisma/schema.prisma`

**Database Security:**
- Database security capabilities (inherited from external systems (outside CUI boundary) service, relied upon operationally, not independently assessed)
- Access controlled via application authentication
- No direct database access for regular users
- Evidence: Microsoft Azure / CUI enclave VM configuration

---

### 4.2 File Storage

**FCI Files:**
- Location: PostgreSQL database `StoredFile` table (BYTEA column)
- Storage Type: Database binary storage
- Access: Signed URLs with expiration
- Evidence: `lib/file-storage.ts`, `prisma/schema.prisma` (StoredFile model)

**CUI Files:**
- Primary storage (bytes): Dedicated CUI vault (<vault-domain>), encrypted at rest; served over TLS.\n+- other systems (outside CUI boundary) storage: `StoredCUIFile` table stores metadata and vault reference (`vaultId`) for access control and auditing; vault-stored records contain no CUI bytes on other systems (outside CUI boundary).\n+- Access: Authenticated and authorized users obtain a short-lived view token and open the vault URL directly (other systems (outside CUI boundary) does not return CUI bytes).\n+- Evidence: `app/api/cui/upload-session/route.ts`, `app/api/cui/view-session/route.ts`, `app/api/cui/record/route.ts`, `lib/file-storage.ts` (`recordCUIUploadMetadata`, `getCUIFileMetadataForView`)

**CUI File Handling Procedures:**
- Users can mark files as CUI during upload
- System auto-detects CUI keywords in filename and metadata
- CUI files are stored separately from FCI/non-CUI files (vault for bytes; other systems (outside CUI boundary) for metadata)\n+- CUI access is enforced via authentication/authorization, MFA, short-lived tokens, and audit logging
- All CUI file access attempts logged to audit log

---

## 5. Data Disposal

### 5.1 Secure Deletion (FAR 52.204-21(b)(2))

**Requirement:** FCI must be securely deleted when no longer needed.

**Implementation:**
- Data deletion is performed via Prisma ORM delete operations
- Database records are permanently deleted from PostgreSQL
- No data remains in database after deletion operation

**Deletion Methods:**
- Prisma `delete()` operations
- Prisma `deleteMany()` operations for bulk deletion
- Database-level deletion (permanent removal)

**Evidence:** All deletion operations use Prisma ORM, which performs permanent database deletions

---

### 5.2 Database Record Deletion

**Process:**
1. Authorized user initiates deletion (via admin interface or API)
2. System verifies user authorization
3. System performs Prisma delete operation
4. Database record is permanently removed
5. No backup or recovery of deleted records (unless database backups exist)

**Deletion Operations:**
- Single record deletion: `prisma.model.delete({ where: { id } })`
- Bulk deletion: `prisma.model.deleteMany({ where: { condition } })`
- Cascade deletion: Related records deleted via Prisma relations

**Evidence:** Prisma ORM provides delete operations that permanently remove records from database

---

### 5.3 Source Code Disposal

**Process:**
- Source code is managed via Git version control
- Deleted files are removed from repository
- Git history may retain deleted file information (standard Git behavior)
- Sensitive information should not be committed to Git repositories

**Best Practices:**
- No FCI or sensitive data in source code
- Environment variables used for sensitive configuration
- `.gitignore` prevents committing sensitive files
- Evidence: `.gitignore` file excludes sensitive files

---

## 6. Media Sanitization

### 6.1 Cloud Storage Sanitization

**Database Records:**
- Deleted records are permanently removed from database
- Database backups may retain deleted records until backup retention expires
- Microsoft Azure / CUI enclave VM manages backup retention policies

**File Storage:**
- Files in `/public/uploads/` are deleted via file system operations
- Deleted files are removed from file system
- No special sanitization required for non-sensitive content

---

### 6.2 Development Environment Sanitization

**Local Development:**
- Local development databases may contain test data
- Test data should not contain real FCI
- Local databases can be reset or deleted as needed

**Evidence:** `scripts/reset-database.ts` provides database reset functionality

---

## 7. Compliance Risks & Open Items

### 7.1 File Upload Storage

**Risk Description:** Uploaded files are currently stored locally within the application runtime in `/public/uploads/` directory. These files are limited to non-sensitive content and are not FCI.

**Current Implementation:**
- Files stored in `/public/uploads/` directory
- Files are within application runtime environment
- No removable media is used
- Files are limited to non-sensitive content

**Mitigation:**
- No FCI is stored in file uploads
- Files are stored within secure application runtime
- No removable media is used for file storage
- Future architectural changes may migrate uploads to managed cloud storage

**Status:** Acceptable for Level 1 compliance; enhancement opportunity for future architecture

**Evidence:** `.gitignore` (lines 43-44) shows `/public/uploads/*` is excluded from version control

---

### 7.2 Database Backup Retention

**Status:** Database backups are managed by Microsoft Azure / CUI enclave VM. Backup retention policies are inherited from other systems (outside CUI boundary). Explicit backup retention and disposal procedures may be documented as a future enhancement.

---

### 7.3 Secure Deletion Verification

**Status:** Deletion operations use Prisma ORM which performs permanent database deletions. Explicit verification procedures for secure deletion may be implemented as a future enhancement.

---

### 7.4 Non-Required Hardening Items (Out of Scope for Level 1)
The following items are not required for CMMC Level 2 but represent potential future enhancements:
- Cryptographic erasure procedures
- Multi-pass overwrite procedures (not applicable to cloud storage)
- Physical media destruction procedures (not applicable, no physical media)

---

## 8. Procedures

### 8.1 Data Disposal Procedure

**For Database Records:**
1. Identify records to be deleted
2. Verify user authorization for deletion
3. Perform Prisma delete operation
4. Verify deletion completed successfully
5. Record deletion in audit log (if implemented)

**For File Storage:**
1. Identify files to be deleted
2. Verify user authorization for deletion
3. Delete files from file system
4. Verify deletion completed successfully

---

### 8.2 Media Handling Procedure

**For Cloud Storage:**
- No special handling required (cloud-based, no physical media)
- Access controlled via authentication
- Encryption provided by platform

**For Source Code:**
- Source code stored in GitHub
- Access controlled via GitHub authentication
- No removable media used

---

## 9. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

## Appendix A: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Database Schema | `prisma/schema.prisma` |
| FCI Models | `prisma/schema.prisma` (GovernmentContractDiscovery, UsaSpendingAward models) |
| File Storage | `.gitignore` (lines 43-44) |
| Database Reset | `scripts/reset-database.ts` |
| No Removable Media | Architecture: All storage is cloud-based |

## Appendix B: FAR 52.204-21 Mapping

| FAR Clause | Control | Implementation |
|------------|---------|----------------|
| 52.204-21(b)(2) | Removable media handling | No removable media used |
| 52.204-21(b)(2) | Secure deletion | Prisma ORM delete operations |
| 52.204-21(b)(2) | Data disposal | Database record deletion |
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-213-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-213-signoff.md`

