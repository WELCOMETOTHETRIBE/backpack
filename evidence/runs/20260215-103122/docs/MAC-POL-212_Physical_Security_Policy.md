# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-212_Physical_Security_Policy.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Physical Security Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains physical security controls to protect Federal Contract Information (FCI) and Controlled Unclassified Information (CUI) and system resources. This policy establishes requirements for physical access controls, device security, and facility security.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2.

---

## 2. Scope

This policy applies to:
- Physical facilities where system development and administration occur
- Computing devices used to access the system
- Physical access to system resources
- Visitor access to facilities

---

## 3. Facility Security

### 3.1 Office Environment

**Environment Type:** Home office or limited office environment

**Description:** MacTech Solutions operates in a home office or limited office environment where authorized personnel work remotely or in small office settings.

**Physical Security Measures:**
- Facilities are secured against unauthorized access
- Work areas are protected from unauthorized viewing
- Sensitive information is not left unattended in visible areas

**Access Control:**
- Only authorized personnel have physical access to work areas
- Physical access is limited to authorized users and enforced through environmental controls appropriate to the operating environment
- Physical access is restricted to business hours or as needed

---

### 3.2 Cloud Infrastructure (Inherited)

**Infrastructure Provider:** hosting provider (historical) cloud platform

**Physical Security:** hosting provider (historical) provides physical security for all cloud infrastructure, including:
- Data center physical access controls
- Environmental controls (temperature, humidity, fire suppression)
- Facility security (guards, surveillance, access logs)
- Redundant power and cooling systems

**Status:** Inherited control from hosting environment (historical)

**Coverage:** All application and database infrastructure hosted on hosting provider (historical)

---

## 4. Device Control

### 4.1 Computing Devices

**Device Types:**
- Laptops and workstations used by authorized personnel
- Mobile devices (if used for system access)
- Development workstations

**Device Security Requirements:**
- Devices must be password-protected
- Devices must have screen lock enabled
- Devices must be kept secure when unattended
- Devices must be updated with security patches

**Device Access:**
- Only authorized personnel may use devices to access the system
- Devices must not be shared with unauthorized individuals
- Devices must be properly secured when not in use

---

### 4.2 Device Disposal

**Procedure:**
- Devices containing FCI or system access must be securely wiped before disposal
- Storage media must be securely erased or destroyed
- Devices must be disposed of in accordance with data disposal procedures

**Note:** Since FCI and CUI are stored in cloud database (not on local devices), device disposal primarily involves removing access credentials and ensuring no cached data remains.

---

## 5. Visitor Access

### 5.1 Visitor Access Policy

**Requirement:** Physical access is limited to authorized users and enforced through environmental controls appropriate to the operating environment.

**Implementation:**
- Access to work areas is restricted to authorized personnel
- Visitors are not provided system access credentials
- Sensitive information is not displayed in visitor-accessible areas
- Physical access is limited to authorized users and enforced through environmental controls appropriate to the operating environment

---

### 5.2 Visitor Restrictions

**Restrictions:**
- Visitors may not access the system
- Visitors may not view FCI or CUI
- Visitors may not access computing devices used for system access

---

## 6. Physical Access Controls

### 6.1 Work Area Security

**Controls:**
- Work areas are secured when unattended
- Computing devices are locked when not in use
- Sensitive documents (if any) are secured
- Access to work areas is restricted to authorized personnel

**Screen Security:**
- Screens are locked when workstations are unattended
- Screens are positioned to prevent unauthorized viewing
- Sensitive information is not displayed in public view

---

### 6.2 Remote Work Security

**Remote Work Considerations:**
- Remote work locations are considered "work areas" for physical access control purposes
- Physical access logs apply to remote work locations where system access occurs
- Devices used for remote access must meet device security requirements
- Remote access must use secure connections (HTTPS/TLS)
- FCI and CUI are not stored on local devices (stored in cloud database)

**Physical Access Logging for Remote Work:**
- Physical access to remote work locations (home offices, remote workstations) must be logged
- Log entries should document: date, time, location (e.g., "Remote Work Location - [City/State]"), purpose, person name
- Remote work locations are subject to the same physical access logging requirements as office locations

**Remote Access:**
- All remote access is via HTTPS/TLS (inherited from hosting environment (historical))
- Authentication is required for all remote access
- No FCI is stored on local devices

**Related Documents:**
- Physical Environment and Remote Work Controls (`MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md`) - Detailed remote work controls, device requirements, and logical access scope

---

## 7. Inherited Controls

### 7.1 hosting environment (historical) Physical Security

**Infrastructure:** hosting provider (historical) cloud platform provides physical security for all hosted infrastructure

**Controls Provided:**
- Data center physical access controls
- Environmental controls
- Facility security (guards, surveillance)
- Redundant systems (power, cooling, networking)

**Status:** Inherited control from hosting environment (historical)

**Coverage:** All application servers, databases, and infrastructure hosted on hosting provider (historical)

**Evidence:** hosting environment (historical) security documentation and certifications

---

### 7.2 GitHub Physical Security

**Infrastructure:** GitHub provides physical security for source code repositories

**Controls Provided:**
- Data center physical access controls
- Environmental controls
- Facility security

**Status:** Inherited control from GitHub platform

**Coverage:** All source code repositories stored in GitHub

---

## 8. Compliance Risks & Open Items

### 8.1 Home Office Security

**Status:** Physical security measures are implemented for home office environments. Formal facility security assessments may be conducted as a future enhancement.

---

### 8.2 Device Inventory

**Status:** Device inventory and tracking may be implemented as a future enhancement. Current focus is on ensuring devices meet security requirements.

---

### 8.3 Physical Access Logging

**Status:** ✅ **Implemented** - Physical access logging module is implemented in the admin portal.

**Implementation:**
- Digital logbook accessible via `/admin/physical-access-logs`
- Admin-only access for creating and managing physical access log entries
- Records: date, time-in, time-out, person name, purpose, host/escort, location, notes
- Immutable entries (tamper-evident with created_at and created_by_user_id)
- CSV export functionality for evidence generation
- **Retention:** Physical access logs are retained for a minimum of 90 days in the database. CSV exports are retained per organizational retention policy.

**Evidence:**
- Admin UI: `/admin/physical-access-logs`
- Database: `PhysicalAccessLog` table
- API: `/api/admin/physical-access-logs`
- Migration: `prisma/migrations/20250122000000_add_physical_access_logs_and_endpoint_inventory/`

**Procedure:** See `05-evidence/templates/physical-access-log-procedure.md` for detailed usage instructions.

---

### 8.4 Non-Required Hardening Items (Future Enhancements)
The following items represent potential future enhancements but are not required for current CMMC Level 2 compliance:
- Biometric access controls
- Security cameras and surveillance systems
- Formal facility security assessments

---

## 9. Procedures

### 9.1 Visitor Access Procedure

1. Physical access is limited to authorized users
2. Visitors are not provided system access credentials
3. Visitors may not access the system or view FCI
4. Physical access is enforced through environmental controls appropriate to the operating environment

---

### 9.2 Device Security Procedure

1. Ensure device is password-protected
2. Enable screen lock with automatic timeout
3. Keep device secure when unattended
4. Do not share device with unauthorized individuals
5. Update device with security patches regularly
6. Securely wipe device before disposal

---

### 9.3 Work Area Security Procedure

1. Secure work area when unattended
2. Lock computing devices when not in use
3. Secure sensitive documents (if any)
4. Position screens to prevent unauthorized viewing
5. Lock screens when leaving work area

---

## 10. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 2.0 (2026-01-24): Updated from CMMC Level 2 to Level 2, updated scope to FCI and CUI, updated references to NIST SP 800-171 Rev. 2
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

## Appendix A: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Cloud Infrastructure | hosting environment (historical) (inherited control) |
| Source Code Storage | GitHub platform (inherited control) |
| Device Security | Organizational procedures |
| Visitor Access | Organizational procedures |

## Appendix B: NIST SP 800-171 Rev. 2 Mapping

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| 3.10.1 | Limit physical access | Office security, device controls, hosting environment (historical) (inherited) |
| 3.10.2 | Protect and monitor facility | Facility protection, hosting environment (historical) (inherited) |
| 3.10.3 | Escort and monitor visitors | Visitor monitoring procedures |
| 3.10.4 | Physical access audit logs | Physical access logging module |
| 3.10.5 | Control physical access devices | Access device controls |
| 3.10.6 | Safeguarding at alternate work sites | Remote work controls and procedures |
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-212-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-212-signoff.md`



---
**QMS signature (SHA-256):** `78390cf14c293e5419b5bc173bd237f16b70b283aeb5dae53819b08db99ce111`
