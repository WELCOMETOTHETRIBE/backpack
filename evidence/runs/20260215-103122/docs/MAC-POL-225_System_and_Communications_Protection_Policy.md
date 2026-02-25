# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-225_System_and_Communications_Protection_Policy.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# System and Communications Protection Policy - CMMC Level 2

**Document Version:** 1.1  
**Date:** 2026-01-27  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.13

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains system and communications protection controls to monitor, control, and protect communications at system boundaries, employ secure architectural designs, implement cryptographic mechanisms, and protect the confidentiality of CUI in transit and at rest.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.13 (System and Communications Protection).

---

## 2. Scope

This policy applies to:
- All system communications
- All network boundaries
- All cryptographic mechanisms
- All CUI in transit and at rest
- All system and communications protection controls

**System Scope:** FCI and CUI environment.

---

## 3. System and Communications Protection Requirements

### 3.1 Monitor, Control, and Protect Communications (3.13.1)

**Requirement:** Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.

**Implementation:**
- Communications monitoring and control provided by hosting environment (historical) (inherited)
- External boundary protection managed by hosting environment (historical)
- Internal boundary controls implemented via application layer
- Network communications protected via TLS/HTTPS

**Evidence:**
- hosting environment (historical) network security (inherited)
- System boundary: SSP Section 2.3

**Status:** 🔄 Inherited (platform), ✅ Implemented (application)

---

### 3.2 Architectural Designs (3.13.2)

**Requirement:** Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security.

**Implementation:**
- System architecture designed with security principles
- Secure software development practices followed
- Defense-in-depth principles applied
- Security-by-design approach implemented

**Evidence:**
- System Description and Architecture: `MAC-IT-301_System_Description_and_Architecture.md`
- System architecture: SSP Section 2

**Status:** ✅ Implemented

---

### 3.3 Separate User/System Management (3.13.3)

**Requirement:** Separate user functionality from system management functionality.

**Implementation:**
- User functionality separated from system management
- Admin portal separated from user interface
- System management functions restricted to ADMIN role

**Evidence:**
- Route separation: `/admin/*` vs user routes
- Role-based access: ADMIN vs USER roles

**Status:** ✅ Implemented

---

### 3.4 Prevent Unauthorized Information Transfer (3.13.4)

**Requirement:** Prevent unauthorized and unintended information transfer via shared system resources.

**Implementation:**
- Information transfer controls implemented via access controls
- Shared system resources protected via authentication and authorization
- Unauthorized information transfer prevented

**Evidence:**
- Access Control Policy: `MAC-POL-210_Access_Control_Policy.md`
- Access controls: `lib/authz.ts`, `middleware.ts`

**Status:** ✅ Implemented

---

### 3.5 Implement Subnetworks (3.13.5)

**Requirement:** Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.

**Implementation:**
- hosting environment (historical) provides logical network separation
- Public network segment: Next.js application
- Internal network segment: PostgreSQL database
- Network boundaries managed by hosting provider (historical) (inherited)

**Evidence:**
- hosting environment (historical) network architecture (inherited)
- System boundary diagram: SSP Section 2.3

**Status:** 🔄 Inherited

---

### 3.6 Deny-by-Default Network Communications (3.13.6)

**Requirement:** Deny network communications traffic by default and allow network communications traffic by exception.

**Implementation:**
- Network traffic control provided by hosting environment (historical) (inherited)
- Default-deny, allow-by-exception enforced by platform

**Evidence:**
- hosting environment (historical) network controls (inherited)

**Status:** 🔄 Inherited

---

### 3.7 Prevent Remote Device Dual Connections (3.13.7)

**Requirement:** Prevent remote devices from simultaneously establishing non-remote connections with the system.

**Implementation:**
- System is cloud-based web application
- All access is remote (via internet)
- No non-remote connections to system

**Evidence:**
- System architecture: Cloud-based, all access remote

**Status:** 🚫 Not Applicable (all access is remote)

---

### 3.8 Cryptographic Mechanisms for CUI in Transit (3.13.8)

**Requirement:** Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.

**Implementation:**
- All CUI transmission encrypted via HTTPS/TLS 1.3 (AES-256-GCM-SHA384)
- CUI vault TLS encryption: cloud service provider (historical) (cloud service provider (historical)) with nginx TLS termination
- Main application TLS encryption: hosting environment (historical) (inherited)
- All communications encrypted in transit

**Evidence:**
- CUI Vault TLS Configuration: `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`
- hosting environment (historical) TLS/HTTPS (inherited)

**Status:** ✅ Implemented (CUI vault), 🔄 Inherited (main application)

---

### 3.9 Terminate Network Connections (3.13.9)

**Requirement:** Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.

**Implementation:**
- Network connection termination managed by hosting environment (historical) (inherited)
- Session termination after 8 hours of inactivity

**Evidence:**
- hosting environment (historical) connection management (inherited)
- Session timeout: 8 hours

**Status:** 🔄 Inherited (network), ✅ Implemented (session)

---

### 3.10 Cryptographic Key Management (3.13.10)

**Requirement:** Establish and manage cryptographic keys for cryptography employed in organizational systems.

**Implementation:**
- Cryptographic key management provided by hosting environment (historical) (inherited)
- TLS key management managed by platform
- Application-level key management for authentication (JWT secrets)

**Evidence:**
- hosting environment (historical) key management (inherited)
- Cryptographic Key Management Evidence: `../05-evidence/MAC-RPT-116_Cryptographic_Key_Management_Evidence.md`

**Status:** ✅ Fully Implemented (Inherited from hosting environment (historical))

---

### 3.11 FIPS-Validated Cryptography (3.13.11)

**Requirement:** Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.

**Implementation:**
- CUI is protected by FIPS-validated cryptography via Linux distribution (historical) cryptographic library Cryptographic Module (FIPS-validated cryptographic module (environment-specific))
- CUI vault TLS: TLS 1.3 (AES-256-GCM-SHA384) using FIPS-validated cryptographic module
- CUI vault database encryption: AES-256-GCM using FIPS-validated cryptographic module
- Kernel FIPS mode: Enabled on CUI vault infrastructure
- FIPS-validated cryptographic module (environment-specific): Active and verified on CUI vault
- FIPS cryptography assessment conducted and documented

**Evidence:**
- FIPS Cryptography Assessment: `../05-evidence/MAC-RPT-110_FIPS_Cryptography_Assessment_Evidence.md`
- CUI Vault TLS Configuration: `../05-evidence/MAC-RPT-126_CUI_Vault_TLS_Configuration_Evidence.md`
- CUI Vault Deployment Evidence: `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`

**Status:** ✅ Implemented (CUI fully FIPS-validated)

---

### 3.12 Collaborative Computing Devices (3.13.12)

**Requirement:** Prohibit remote activation of collaborative computing devices and provide indication of devices in use.

**Implementation:**
- System is web application (no collaborative computing devices)
- No remote activation of devices

**Evidence:**
- System architecture: Web application, no collaborative devices

**Status:** 🚫 Not Applicable (no collaborative computing devices)

---

### 3.13 Mobile Code Control (3.13.13)

**Requirement:** Control and monitor the use of mobile code.

**Implementation:**
- Mobile code control policy to be established
- Mobile code usage controlled and monitored
- Mobile code restrictions documented

**Evidence:**
- Mobile Code Control Procedure: `MAC-SOP-237_Mobile_Code_Control_Procedure.md`
- Mobile Code Control Evidence: `../05-evidence/MAC-RPT-117_Mobile_Code_Control_Evidence.md`

**Status:** ✅ Fully Implemented

---

### 3.14 VoIP Control (3.13.14)

**Requirement:** Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.

**Implementation:**
- System does not use VoIP technologies
- VoIP not applicable to system architecture

**Evidence:**
- System architecture: Web application, no VoIP

**Status:** 🚫 Not Applicable (no VoIP technologies used)

---

### 3.15 Protect Authenticity of Communications (3.13.15)

**Requirement:** Protect the authenticity of communications sessions.

**Implementation:**
- Communication session authenticity protected via TLS/HTTPS
- TLS provides authentication of communications
- Session authenticity enforced by hosting environment (historical) (inherited)

**Evidence:**
- hosting environment (historical) TLS/HTTPS (inherited)

**Status:** 🔄 Inherited

---

### 3.16 Protect CUI at Rest (3.13.16)

**Requirement:** Protect the confidentiality of CUI at rest.

**Implementation:**
- CUI stored in dedicated CUI vault on cloud service provider (historical) (cloud service provider (historical))
- CUI vault database: PostgreSQL on cloud service provider (historical) with AES-256-GCM encryption using FIPS-validated cryptographic module
- CUI records encrypted at field level (ciphertext, nonce, tag) using AES-256-GCM
- Database encryption at rest: cloud service provider (historical) infrastructure (inherited)
- Main application database: managed database service (historical) service (for non-CUI data)
- Passwords encrypted using bcrypt hashing

**Evidence:**
- CUI Vault Deployment Evidence: `../05-evidence/MAC-RPT-125_CUI_Vault_Deployment_Evidence.md`
- FIPS Cryptography Assessment: `../05-evidence/MAC-RPT-110_FIPS_Cryptography_Assessment_Evidence.md`
- hosting environment (historical) database encryption at rest (inherited for main application)

**Status:** ✅ Implemented (CUI vault), 🔄 Inherited (main application database)

---

## 4. Network Architecture

### 4.1 Network Segmentation

**Main Application Architecture (hosting provider (historical)):**
- Public network segment: Next.js application
- Internal network segment: PostgreSQL database (non-CUI data)
- Network boundaries: hosting environment (historical) managed

**CUI Vault Architecture (cloud service provider (historical)):**
- Public network segment: nginx web server (TLS termination)
- Internal network segment: PostgreSQL database (localhost only, <REDACTED_IP>:5432)
- Network boundaries: cloud service provider (historical) managed
- Domain: <vault-domain>

---

### 4.2 Communication Protection

**Encryption:**
- All communications encrypted via TLS/HTTPS
- Main application: TLS encryption via hosting environment (historical) (inherited)
- CUI vault: TLS 1.3 (AES-256-GCM-SHA384) via cloud service provider (historical) with nginx
- Database connections encrypted
- CUI in transit protected via FIPS-validated cryptography
- CUI at rest protected via FIPS-validated cryptography (AES-256-GCM)

---

## 5. Roles and Responsibilities

### 5.1 System Administrator

**Responsibilities:**
- Monitor system communications
- Manage cryptographic configurations
- Document network architecture
- Verify communication protection

### 5.2 hosting environment (historical) (Inherited - Main Application)

**Responsibilities:**
- Provide network security for main application
- Manage TLS/HTTPS for main application
- Provide database encryption for non-CUI data
- Manage network boundaries for main application

### 5.3 cloud service provider (historical) (CUI Vault Infrastructure)

**Responsibilities:**
- Provide network security for CUI vault
- Manage TLS/HTTPS for CUI vault (nginx TLS termination)
- Provide infrastructure for FIPS-validated cryptography
- Manage network boundaries for CUI vault
- Ensure FIPS mode is enabled and active

---

## 6. Related Documents

- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.13)
- System Description and Architecture: `MAC-IT-301_System_Description_and_Architecture.md`
- FIPS Cryptography Assessment: `../05-evidence/MAC-RPT-110_FIPS_Cryptography_Assessment_Evidence.md`

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.1 (2026-01-27): Updated to reflect CUI vault architecture on cloud service provider (historical) (cloud service provider (historical)), corrected FIPS validation status to Implemented, and clarified separation between main application (hosting provider (historical)) and CUI vault (cloud service provider (historical))
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2

---

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.13 (System and Communications Protection)
- FIPS 140-2/140-3 (Cryptographic Module Validation)
- CMMC 2.0 Level 2 Assessment Guide
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-225-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-225-signoff.md`



---
**QMS signature (SHA-256):** `eaf16186c8bb211d44dbb40ca0536aa83a7c8260c51b2edd6babedbca10be576`
