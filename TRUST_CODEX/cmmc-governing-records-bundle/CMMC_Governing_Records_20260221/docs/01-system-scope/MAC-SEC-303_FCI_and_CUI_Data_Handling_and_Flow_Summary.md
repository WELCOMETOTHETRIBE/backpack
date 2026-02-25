# FCI Data Handling and Flow Summary - CMMC Level 1

**Document Version:** 1.0  
**Date:** 2026-01-21  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 1 (Foundational)  
**Reference:** FAR 52.204-21

**Applies to:** CMMC 2.0 Level 1 (FCI-only system)

---

## 1. Purpose

This document summarizes how Federal Contract Information (FCI) and Controlled Unclassified Information (CUI) are handled, processed, stored, and transmitted within the MacTech Solutions system. This summary supports the FCI and CUI Scope and Data Boundary Statement (`MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md`) and provides a high-level overview of FCI and CUI data flows.

---

## 2. FCI Data Types

### 2.1 Contract Opportunity Data

**Source:** SAM.gov API (public data) + Internal processing  
**Data Type:** FCI only when combined with internal, non-public data

**Note:** Publicly available SAM.gov data is not FCI by itself. FCI exists when:
- Public data is combined with internal, non-public information
- Internal analysis, annotations, or derived data is generated
- User-generated content combines public data with non-public information

**Examples of FCI:**
- Internal analysis of contract opportunities
- User annotations and notes on opportunities
- Derived scoring and relevance assessments
- Internal tracking and management data

### 2.2 Historical Award Data

**Source:** USAspending.gov API (public data) + Internal processing  
**Data Type:** FCI only when combined with internal, non-public data

**Note:** Publicly available USAspending.gov data is not FCI by itself. FCI exists when combined with internal, non-public information.

**Examples of FCI:**
- Internal analysis of award data
- User-generated insights and annotations
- Derived data from internal processing

### 2.3 Derived Data

**Source:** System processing of FCI  
**Data Type:** FCI (derived from FCI remains FCI)

**Examples:**
- Opportunity scores and relevance assessments
- Analysis and recommendations
- User annotations and notes
- System-generated metadata

---

## 3. FCI Data Flow

### 3.1 Ingestion Flow

**Step 1: Data Acquisition**
- System connects to SAM.gov API (read-only, public API)
- System connects to USAspending.gov API (read-only, public API)
- All connections use HTTPS/TLS encryption (inherited from other systems (outside CUI boundary))

**Step 2: Data Processing**
- FCI is received from government APIs
- Data is normalized and validated
- CUI keyword filtering is applied as a guardrail
- Data is prepared for storage

**Step 3: Data Storage**
- FCI is stored in PostgreSQL database on other systems (outside CUI boundary)
- Database encryption at rest (security capabilities relied upon from other systems (outside CUI boundary), not independently assessed)
- All FCI is stored within system boundary

### 3.2 Access Flow

**Step 1: User Authentication**
- User authenticates via NextAuth.js
- Credentials validated against database
- Session created upon successful authentication
- All authentication communications encrypted via HTTPS/TLS

**Step 2: Authorization Check**
- Middleware verifies user role (USER or ADMIN)
- Access permissions checked
- FCI access restricted to authenticated users

**Step 3: Data Retrieval**
- User requests FCI data
- System queries database
- FCI is retrieved and transmitted to user
- All data transmission encrypted via HTTPS/TLS

### 3.3 Processing Flow

**Step 1: User Interaction**
- User views, searches, or analyzes FCI
- User creates annotations or notes
- User generates reports or exports

**Step 2: Data Processing**
- System processes FCI according to user requests
- Derived data may be generated (scores, analysis)
- All processing occurs within system boundary

**Step 3: Data Presentation**
- Processed FCI is presented to user
- Data transmitted via HTTPS/TLS
- User views FCI in web browser

---

## 4. FCI Storage

### 4.1 Primary Storage

**Location:** PostgreSQL database on other systems (outside CUI boundary)  
**Encryption:** Database security capabilities relied upon from other systems (outside CUI boundary) (not independently assessed)  
**Access:** Restricted to authenticated users with appropriate authorization  
**Retention:** FCI retained per business requirements

### 4.2 Storage Structure

**Database Tables:**
- Opportunity data stored in opportunity-related tables
- Award data stored in award-related tables
- User annotations stored in user-specific tables
- All FCI stored within defined database schema

**Evidence:** Database schema defined in `prisma/schema.prisma`

### 4.3 No Removable Media

- No FCI is stored on removable media
- All FCI stored in cloud database
- No local device storage of FCI

---

## 5. FCI Transmission

### 5.1 In Transit Encryption

**Client to Application:**
- All communications encrypted via HTTPS/TLS
- TLS provided by other systems (outside CUI boundary) (inherited control)
- All FCI transmission encrypted

**Application to Database:**
- Database connections encrypted
- Connection security provided by other systems (outside CUI boundary)

**Application to External APIs:**
- All external API calls use HTTPS/TLS
- SAM.gov and USAspending.gov APIs accessed via encrypted connections

### 5.2 Transmission Controls

- All FCI transmission requires authentication
- Access controls restrict FCI access to authorized users
- No FCI transmitted to unauthorized parties

---

## 6. FCI Access Controls

### 6.1 Authentication Requirements

- All FCI access requires user authentication
- Authentication via NextAuth.js with credentials provider
- Passwords hashed using bcrypt (12 rounds)
- Session management for authenticated access

### 6.2 Authorization Requirements

- Role-based access control (RBAC)
- USER role: Limited access to FCI
- ADMIN role: Full access to FCI and system administration
- Access permissions enforced by middleware

### 6.3 Access Logging

- All FCI access logged in AppEvent table
- Login events logged
- File access events logged
- Admin actions logged
- Logs retained for minimum 90 days

---

## 7. FCI Disposal

### 7.1 Data Deletion

- FCI deleted via database record deletion
- Permanent deletion from database
- No removable media requiring sanitization

### 7.2 Disposal Procedures

- FCI deletion performed via admin interface
- Deletion logged in AppEvent table
- Deleted records permanently removed from database
- No recovery of deleted FCI

---

## 8. FCI Protection Measures

### 8.1 Technical Controls

- Authentication required for all access
- Authorization enforced by middleware
- HTTPS/TLS encryption for all transmission
- Database security capabilities (relied upon from other systems (outside CUI boundary))
- Password hashing (bcrypt, 12 rounds)
- CUI keyword filtering as guardrail

### 8.2 Procedural Controls

- User Access and FCI Handling Acknowledgement required
- User training on FCI handling
- Administrative oversight
- Incident reporting procedures

### 8.3 Physical Controls

- Cloud infrastructure physical security (inherited from other systems (outside CUI boundary))
- No local device storage of FCI
- Office security for workstations accessing system

---

## 9. Related Documents

- FCI and CUI Scope and Data Boundary Statement (`MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md`)
- System Description (`MAC-IT-301_System_Description_and_Architecture.md`)
- System Boundary (`MAC-IT-105_System_Boundary.md`)
- Access Control Policy (`../02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md`)
- Media Handling Policy (`../02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md`)

---

## 10. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---
