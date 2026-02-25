# CUI Data Flow Diagram - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Sections 3.1.3, 3.8.2, 3.13.11

**Applies to:** CMMC 2.0 Level 2 (CUI system)

---

## Purpose

This document provides the authoritative CUI data flow diagram for the MacTech Solutions Application, showing all points where CUI enters, is stored, processed, transmitted, and destroyed within the system. This diagram is referenced in the System Security Plan (Section 3.2) and maps to specific security controls.

---

## CUI Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CUI DATA FLOW - CMMC LEVEL 2                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ CUI_WORKSPACE │
│ (Windows Server 2025 CUI Workspace VM)  │
└──────┬───────┘
       │ HTTPS/TLS (Encrypted)
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INGRESS POINT                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/cui/upload-session                                         │  │
│  │ - Authentication required (NextAuth.js)                              │  │
│  │ - MFA required for all users (CMMC Level 2)                          │  │
│  │ - Metadata only: fileName, mimeType, fileSize                        │  │
│  │ - Returns uploadUrl + short-lived token                              │  │
│  │ - CUI workspace uploads CUI directly to vault (no bytes on other systems (outside CUI boundary))  │  │
│  │ Control: 3.1.3 (Control CUI flow)                                   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STORAGE POINT                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Primary: CUI Vault (Microsoft Azure IaaS (Windows Server 2025 VM))                          │  │
│  │ - Domain: <vault-domain>                              │  │
│  │ - PostgreSQL database (localhost only)                                │  │
│  │ - AES-256-GCM encrypted CUI records (ciphertext, nonce, tag)         │  │
│  │ - API key authentication                                              │  │
│  │ - TLS 1.3 encryption (AES-256-GCM-SHA384)                            │  │
│  │ - Microsoft Azure disk encryption at rest                                │  │
│  │ Control: 3.8.2 (Limit access to CUI on system media)                  │  │
│  │ Control: 3.13.11 (FIPS-validated cryptography for CUI)               │  │
│  │ Control: 3.13.16 (Protect CUI at rest)                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Secondary: PostgreSQL Database (other systems (outside CUI boundary)) - METADATA ONLY            │  │
│  │ - Table: StoredCUIFile (metadata only, not CUI content)              │  │
│  │ - Stores: redacted label, size, mimeType, uploader info, access ctrl │  │
│  │ - Legacy files: Backward compatibility only (exception, not normal) │  │
│  │ - Vault requirement: All new CUI files require vault (no fallback)   │  │
│  │ - Note: other systems (outside CUI boundary) infrastructure is OUTSIDE CUI security boundary      │  │
│  │ - Access control: Admin role or file owner only                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROCESSING POINT                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Application Logic                                                    │  │
│  │ - CUI metadata access control (no byte handling)                     │  │
│  │ - View-session token issuance (/api/cui/view-session)                │  │
│  │ - Role-based authorization checks                                    │  │
│  │ - CUI access logging (audit system, no filenames)                    │  │
│  │ - CUI keyword detection only to block CUI on /api/files/upload       │  │
│  │ Control: 3.1.3 (Control CUI flow)                                   │  │
│  │ Control: 3.8.2 (Limit access to CUI on system media)               │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
       ▼                                     ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────────┐
│      EGRESS POINT           │   │      ADMIN EXPORT EGRESS                │
│  ┌───────────────────────┐ │   │  ┌───────────────────────────────────┐  │
│  │ GET /api/cui/view-session│ │  │  │ Admin-only CUI exports           │  │
│  │ - Authentication req'd  │ │  │  │ - Reports containing CUI        │  │
│  │ - MFA required          │ │  │  │ - CUI-marked documents          │  │
│  │ - Returns vault URL+token│ │ │  │ Control: 3.1.3 (Control CUI)    │  │
│  │ - CUI workspace opens vault│ │  │  └───────────────────────────────────┘  │
│  │ - Access logged (no fn) │ │  └─────────────────────────────────────────┘
│  │ Control: 3.1.3          │ │
│  └────────────────────────┘ │
└─────────────────────────────┘
       │
       │ HTTPS/TLS (Encrypted)
       ▼
┌──────────────┐
│ CUI_WORKSPACE │
│ (Windows Server 2025 CUI Workspace VM)  │
└──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        DESTRUCTION POINT                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Secure Deletion                                                      │  │
│  │ - Database record deletion via Prisma ORM                            │  │
│  │ - Permanent removal from StoredCUIFile table                         │  │
│  │ - No recovery of deleted records (unless backups exist)             │  │
│  │ - Secure deletion procedures documented                             │  │
│  │ Control: 3.8.2 (Limit access to CUI on system media)                 │  │
│  │ Control: Media Handling Policy (MAC-POL-213)                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Points and Security Controls

### 1. Ingress Point

**Location:** `/api/cui/upload-session` endpoint  
**Function:** CUI upload session (metadata only); browser uploads bytes directly to vault

**Security Controls:**
- **3.1.3 (Control CUI flow):** CUI uploads are routed to vault via tokenized direct upload
- **3.5.3 (MFA):** All users must authenticate with MFA before uploading CUI
- **3.5.1 (Identify users):** Authentication required via NextAuth.js
- **3.3.1 (Audit logging):** All CUI uploads logged to audit system

**Implementation:**
- Upload session API: `app/api/cui/upload-session/route.ts`
- Direct upload to vault: `POST https://vault.<domain>/v1/files/upload` (Bearer token)
- CUI detection: `lib/cui-blocker.ts` (reject CUI on `/api/files/upload`)
- Authentication: `lib/authz.ts` (`requireAuth`)
- Metadata record: `app/api/cui/record/route.ts` (`recordCUIUploadMetadata`)

---

### 2. Storage Point

**Primary Location:** CUI Vault (Microsoft Azure) - <vault-domain>  
**Metadata Location:** PostgreSQL `StoredCUIFile` table (other systems (outside CUI boundary)) - for file metadata, access control, and backward compatibility with legacy files  
**Function:** CUI file storage with encryption at rest

**CUI Vault Storage:**
- Dedicated CUI storage infrastructure on Microsoft Azure IaaS (Windows Server 2025 VM)
- PostgreSQL database on localhost only (<REDACTED_IP>:5432)
- AES-256-GCM encryption for CUI records (ciphertext, nonce, tag fields)
- API key authentication for access
- TLS 1.3 encryption for data in transit (AES-256-GCM-SHA384)
- Microsoft Azure disk encryption at rest

**Metadata Storage (other systems (outside CUI boundary) - Metadata Only):**
- Database table: `prisma/schema.prisma` (StoredCUIFile model)
- Storage function: `lib/file-storage.ts` (`storeCUIFile`)
- Purpose: Stores file metadata, access control data, and provides backward compatibility for legacy files
- New CUI files are stored in CUI vault; this table stores metadata and legacy files only
- Encryption: external systems (outside CUI boundary) encryption at rest (for metadata only, not CUI content)
- **Vault Requirement:** CUI vault is required for all new CUI file uploads. If vault unavailable, upload is rejected (no fallback to other systems (outside CUI boundary) storage).
- Note: other systems (outside CUI boundary) infrastructure is OUTSIDE the CUI security boundary. other systems (outside CUI boundary) does not store CUI content per system boundary.

**Security Controls:**
- **3.8.2 (Limit access to CUI on system media):** CUI stored separately from FCI, access-controlled (both CUI vault and application database)
- **3.13.11 (FIPS-validated cryptography):** Database encryption at rest (other systems (outside CUI boundary) and Microsoft Azure), TLS 1.3 with FIPS-compliant cipher suite
- **3.13.16 (Protect CUI at rest):** Multi-layer encryption (application-level AES-256-GCM + infrastructure-level disk encryption)
- **3.5.1 (Identify users):** Access requires authenticated user and API key (CUI vault)
- **3.1.3 (Control CUI flow):** CUI segregated in dedicated infrastructure and dedicated table

**Evidence:**
- CUI vault deployment: `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`
- CUI vault database encryption: `../05-evidence/MAC-RPT-127_CUI_Vault_Database_Encryption_Evidence.md`
- CUI vault TLS configuration: `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`

---

### 3. Processing Point

**Location:** Application logic layer  
**Function:** CUI access control, authorization, and monitoring

**Security Controls:**
- **3.1.3 (Control CUI flow):** CUI access controlled via vault token issuance and role-based access
- **3.8.2 (Limit access to CUI on system media):** Only authorized users (admin or file owner) can access CUI
- **3.3.1 (Audit logging):** All CUI access attempts logged
- **3.5.3 (MFA):** MFA required for all CUI system access

**Implementation:**
- Access control: `lib/file-storage.ts` (`getCUIFile`)
- Password verification: `lib/file-storage.ts` (`verifyCUIPassword`)
- Authorization: `lib/authz.ts` (role-based checks)
- Audit logging: `lib/audit.ts` (CUI access events)

---

### 4. Egress Point

**Location:** `/api/cui/view-session` endpoint and admin export functions  
**Function:** Authorized CUI file access via vault URL/token; browser downloads directly from vault

**Security Controls:**
- **3.1.3 (Control CUI flow):** CUI egress controlled via authentication, authorization, and vault token issuance
- **3.5.3 (MFA):** MFA required for all users accessing CUI
- **3.8.2 (Limit access to CUI on system media):** Only authorized users can download CUI
- **3.3.1 (Audit logging):** All CUI downloads logged
- **3.13.11 (FIPS-validated cryptography):** CUI transmission encrypted via HTTPS/TLS

**Implementation:**
- View session API: `app/api/cui/view-session/route.ts`
- Direct vault download: `GET https://vault.<domain>/v1/files/{vaultId}?token=...`
- Export functions: Admin-only export capabilities
- Encryption in transit: HTTPS/TLS (vault terminates CUI bytes)
- Access logging: `lib/audit.ts` (CUI file access events, no filenames)

---

### 5. Destruction Point

**Location:** Database deletion operations  
**Function:** Secure deletion of CUI files

**Security Controls:**
- **3.8.2 (Limit access to CUI on system media):** CUI deletion requires authorization
- **Media Handling Policy:** Secure deletion procedures documented in MAC-POL-213
- **3.3.1 (Audit logging):** CUI deletion events logged

**Implementation:**
- Deletion: Prisma ORM delete operations
- Database: Permanent removal from `StoredCUIFile` table
- Procedures: Documented in `MAC-POL-213_Media_Handling_Policy.md`

---

## Control Mapping Summary

| Control ID | Control Name | Flow Point(s) | Implementation |
|------------|--------------|---------------|----------------|
| 3.1.3 | Control CUI flow | Ingress, Processing, Egress | CUI routing, access control, password protection |
| 3.8.2 | Limit access to CUI on system media | Storage, Processing, Egress, Destruction | Separate table, role-based access, secure deletion |
| 3.13.11 | FIPS-validated cryptography | Storage, Egress | CUI vault database encryption (FIPS-validated), CUI vault TLS 1.3 (FIPS-validated) |
| 3.5.3 | Multifactor authentication | Ingress, Processing, Egress | MFA required for all users |
| 3.5.1 | Identify users | All points | NextAuth.js authentication |
| 3.3.1 | Audit logging | All points | Comprehensive audit logging |

---

## Related Documents

- System Security Plan: `MAC-IT-304_System_Security_Plan.md` (Section 3.2)
- Access Control Policy: `../02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md`
- Media Handling Policy: `../02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md`
- CUI Blocking Technical Controls Evidence: `../05-evidence/MAC-RPT-101_CUI_Blocking_Technical_Controls_Evidence.md`
- FIPS Cryptography Assessment: `../05-evidence/MAC-RPT-110_FIPS_Cryptography_Assessment_Evidence.md`

---

## Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*
**Next Review Date:** 2026-02-24

**Change History:**
- Version 1.0 (2026-01-24): Initial CUI data flow diagram for CMMC Level 2 assessment
