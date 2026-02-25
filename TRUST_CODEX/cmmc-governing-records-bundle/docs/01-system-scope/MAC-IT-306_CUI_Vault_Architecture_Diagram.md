# CUI Vault Architecture Diagram - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-27  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (CUI system)

---

## 1. Purpose

This document provides the architecture diagram and detailed description of the CUI vault infrastructure, showing network architecture, data flow, security controls, and encryption points for the dedicated CUI storage system.

---

## 2. CUI Vault Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CUI VAULT ARCHITECTURE - CMMC LEVEL 2                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL NETWORK (Internet)                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    Main Application (other systems (outside CUI boundary))                        │  │
│  │  - Next.js Application                                              │  │
│  │  - CUI file upload/access logic                                      │  │
│  │  - API client for CUI vault                                          │  │
│  └──────────────────────┬──────────────────────────────────────────────┘  │
│                         │ HTTPS/TLS 1.3                                     │
│                         │ (AES-256-GCM-SHA384)                              │
│                         │ API Key Authentication                            │
│                         │ <vault-domain>:443                │
│                         ▼                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                         │
                         │ Microsoft Azure VPC
                         │ Network Boundary
                         │
┌────────────────────────▼─────────────────────────────────────────────────────┐
│              CUI VAULT INFRASTRUCTURE (Microsoft Azure IaaS (Windows Server 2025 VM))                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    PUBLIC NETWORK SEGMENT                           │  │
│  │  ┌───────────────────────────────────────────────────────────────┐ │  │
│  │  │  nginx Web Server                                              │ │  │
│  │  │  - TLS 1.3 termination                                         │ │  │
│  │  │  - Security headers (HSTS, X-Frame-Options, etc.)              │ │  │
│  │  │  - API request routing                                          │ │  │
│  │  └──────────────────────┬──────────────────────────────────────────┘ │  │
│  │                         │ Internal Network (localhost)                │  │
│  │                         ▼                                            │  │
│  │  ┌───────────────────────────────────────────────────────────────┐ │  │
│  │  │  CUI Vault Service (systemd)                                    │ │  │
│  │  │  - REST API endpoints                                           │ │  │
│  │  │  - API key authentication                                        │ │  │
│  │  │  - CUI encryption/decryption (AES-256-GCM)                        │ │  │
│  │  │  - Database operations                                          │ │  │
│  │  └──────────────────────┬──────────────────────────────────────────┘ │  │
│  │                         │ PostgreSQL Connection                      │  │
│  │                         │ (localhost only)                            │  │
│  │                         ▼                                            │  │
│  │  ┌───────────────────────────────────────────────────────────────┐ │  │
│  │  │  INTERNAL NETWORK SEGMENT (localhost)                          │ │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │ │  │
│  │  │  │  PostgreSQL Database                                     │ │ │  │
│  │  │  │  - Database: cuivault                                     │ │ │  │
│  │  │  │  - Binding: <REDACTED_IP>:5432 (localhost only)              │ │ │  │
│  │  │  │  - Table: cui_records                                     │ │ │  │
│  │  │  │    * id (uuid)                                            │ │ │  │
│  │  │  │    * ciphertext (bytea) - Encrypted CUI data             │ │ │  │
│  │  │  │    * nonce (bytea) - Encryption nonce/IV                  │ │ │  │
│  │  │  │    * tag (bytea) - Authentication tag                    │ │ │  │
│  │  │  │    * created_at (timestamp)                               │ │ │  │
│  │  │  │  - Encryption: AES-256-GCM (application-level)           │ │ │  │
│  │  │  │  - Disk encryption: Microsoft Azure (infrastructure)│ │ │  │
│  │  │  └─────────────────────────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Infrastructure Security:                                                  │
│  - Microsoft Azure VPC network isolation                             │
│  - Microsoft Azure firewall rules                                     │
│  - Microsoft Azure disk encryption at rest                            │
│  - Physical security (inherited from Microsoft Azure)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Network Architecture

### 3.1 Network Segments

**Public Network Segment:**
- **Component:** nginx web server
- **Access:** Public internet via HTTPS (port 443)
- **Domain:** <vault-domain>
- **Protocol:** TLS 1.3
- **Cipher Suite:** TLS_AES_256_GCM_SHA384
- **Security:** TLS termination, security headers, API routing

**Internal Network Segment:**
- **Component:** CUI vault service and PostgreSQL database
- **Access:** Localhost only (<REDACTED_IP>)
- **Network Binding:** Database bound to <REDACTED_IP>:5432
- **Security:** No external network access to database

**Infrastructure Network:**
- **Component:** Microsoft Azure VPC
- **Access:** VPC network isolation
- **Security:** VPC firewall rules, network segmentation

---

## 4. Data Flow

### 4.1 CUI Storage Flow

1. **Ingress:**
   - Main application initiates HTTPS/TLS 1.3 connection to CUI vault
   - API request includes API key in `X-VAULT-KEY` header
   - CUI data sent in request body (JSON format)

2. **TLS Encryption:**
   - Data encrypted in transit via TLS 1.3 (AES-256-GCM-SHA384)
   - Certificate: Let's Encrypt (<vault-domain>)
   - Security headers applied (HSTS, X-Frame-Options, etc.)

3. **API Processing:**
   - nginx receives and routes request
   - CUI vault service authenticates API key
   - CUI data encrypted using AES-256-GCM
   - Encrypted components (ciphertext, nonce, tag) generated

4. **Database Storage:**
   - Encrypted CUI record stored in PostgreSQL database
   - Database connection via localhost only (<REDACTED_IP>:5432)
   - Database files encrypted at rest by Microsoft Azure

5. **Response:**
   - Unique record ID returned to main application
   - Response encrypted via TLS 1.3

---

### 4.2 CUI Retrieval Flow

1. **Request:**
   - Main application requests CUI record by ID
   - API key authentication required
   - HTTPS/TLS 1.3 encryption

2. **Database Retrieval:**
   - CUI vault service queries database (localhost connection)
   - Encrypted record retrieved (ciphertext, nonce, tag)

3. **Decryption:**
   - CUI vault service decrypts record using AES-256-GCM
   - Decryption key retrieved from secure storage

4. **Response:**
   - Decrypted CUI data returned to main application
   - Response encrypted via TLS 1.3

---

## 5. Security Controls

### 5.1 Encryption Points

**Data in Transit:**
- **Point 1:** Main application to CUI vault (TLS 1.3, AES-256-GCM-SHA384)
- **Point 2:** nginx to CUI vault service (internal network, localhost)
- **Encryption:** TLS 1.3 with FIPS-compliant cipher suite

**Data at Rest:**
- **Point 1:** Application-level encryption (AES-256-GCM)
  - CUI data encrypted before database storage
  - Separate fields for ciphertext, nonce, and tag
- **Point 2:** Infrastructure-level encryption (Microsoft Azure)
  - Disk encryption at rest for all persistent storage
  - Database files automatically encrypted

---

### 5.2 Access Controls

**Network Access:**
- Database bound to localhost only (<REDACTED_IP>:5432)
- No external network access to database
- VPC firewall rules at infrastructure level

**Application Access:**
- API key authentication required (`X-VAULT-KEY` header)
- API key stored in systemd environment variables
- Unauthenticated requests return 401 Unauthorized

**Database Access:**
- PostgreSQL user authentication required
- Database access restricted to localhost processes
- No direct database access from external network

---

### 5.3 Network Security

**Firewall Configuration:**
- Microsoft Azure VPC firewall rules (infrastructure level)
- host firewall firewall (host-based) - ⚠️ Currently inactive (POAM-014 tracks remediation)

**Network Isolation:**
- Database isolated on localhost network segment
- VPC network isolation at infrastructure level
- Logical separation between public and internal network segments

---

## 6. Infrastructure Components

### 6.1 Compute Infrastructure

**Provider:** Microsoft Azure  
**Service:** Microsoft Azure IaaS (Windows Server 2025 VM)  
**VM Name:** (as deployed in Azure)  
**Operating System:** Windows Server 2025  
**Region:** Microsoft Azure (region as deployed)

---

### 6.2 Service Components

**Web Server:** nginx
- TLS 1.3 termination
- Security headers configuration
- API request routing

**Application Service:** CUI vault service (systemd)
- REST API implementation
- API key authentication
- AES-256-GCM encryption/decryption
- Database operations

**Database:** PostgreSQL
- Version: As deployed (document in release package if required)
- Database name: cuivault
- Database user: cuivault_user
- Network binding: <REDACTED_IP>:5432

---

### 6.3 Security Components

**TLS/SSL:**
- Protocol: TLS 1.3
- Cipher Suite: TLS_AES_256_GCM_SHA384
- Certificate: Let's Encrypt (<vault-domain>)
- Certificate Authority: Let's Encrypt R12 → ISRG Root X1

**Encryption:**
- Application-level: AES-256-GCM (Windows CNG/BitLocker FIPS-validated cryptography)
- Infrastructure-level: Microsoft Azure disk encryption

**Authentication:**
- API key authentication (X-VAULT-KEY header)
- PostgreSQL user authentication

---

## 7. Compliance Controls Mapping

### 7.1 Access Control (AC)

**3.1.3 - Control flow of CUI:**
- CUI vault provides dedicated, isolated storage infrastructure
- API key authentication controls access
- Database localhost-only binding prevents unauthorized network access

**Evidence:** `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`, `../05-evidence/MAC-RPT-128_CUI_Vault_Network_Security_Evidence.md`

---

### 7.2 Media Protection (MP)

**3.8.2 - Limit access to CUI on system media:**
- Database access restricted to localhost only
- API key authentication required for all operations
- Encrypted CUI records with separate access controls

**Evidence:** `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`, `../05-evidence/MAC-RPT-127_CUI_Vault_Database_Encryption_Evidence.md`

---

### 7.3 System and Communications Protection (SC)

**3.13.8 - Cryptographic mechanisms for CUI in transit:**
- TLS 1.3 protocol implemented
- FIPS-compliant cipher suite (TLS_AES_256_GCM_SHA384)
- All CUI transmission encrypted

**Evidence:** `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`, `../05-evidence/MAC-RPT-128_CUI_Vault_Network_Security_Evidence.md`

**3.13.11 - FIPS-validated cryptography:**
- TLS 1.3 with FIPS-compliant cipher suite
- All cipher suite components are FIPS-approved algorithms
- FIPS-validated cryptography: Windows CNG and BitLocker (FIPS-validated per NIST CMVP); used for CUI at rest and in transit on the enclave VM.

**Evidence:** `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`

**3.13.16 - Protect CUI at rest:**
- Multi-layer encryption (AES-256-GCM application-level + Microsoft Azure disk encryption)
- Encrypted CUI records in database
- Database files encrypted at rest

**Evidence:** `../05-evidence/MAC-RPT-127_CUI_Vault_Database_Encryption_Evidence.md`

---

### 7.4 Configuration Management (CM)

**3.4.2 - Security configuration settings:**
- TLS 1.3 configuration with strong cipher suite
- Security headers configured
- Database localhost-only binding
- ⚠️ host firewall firewall inactive (POAM-014 tracks remediation)

**Evidence:** `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`, `../05-evidence/MAC-RPT-128_CUI_Vault_Network_Security_Evidence.md`

---

### 7.5 Physical Protection (PE)

**3.10.1 - Limit physical access:**
- Physical security inherited from Microsoft Azure
- Data center physical access controls
- Environmental controls

**Evidence:** `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`

---

## 8. Related Documents

- System Security Plan: `MAC-IT-304_System_Security_Plan.md`
- System Architecture: `MAC-IT-301_System_Description_and_Architecture.md`
- System Boundary: `MAC-IT-105_System_Boundary.md`
- CUI Data Flow Diagram: `MAC-IT-305_CUI_Data_Flow_Diagram.md`
- CUI Vault Deployment Evidence: `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`
- CUI Vault TLS Configuration: `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`
- CUI Vault Database Encryption: `../05-evidence/MAC-RPT-127_CUI_Vault_Database_Encryption_Evidence.md`
- CUI Vault Network Security: `../05-evidence/MAC-RPT-128_CUI_Vault_Network_Security_Evidence.md`
- POAM Tracking Log: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`

---

## 9. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*
**Next Review Date:** 2026-04-27

**Change History:**
- **Version 1.0 (2026-01-27):** Initial CUI vault architecture diagram document

---

**Document Status:** This document provides the architecture diagram for the CUI vault infrastructure and is maintained under configuration control as part of the MacTech Solutions compliance documentation package.
