# Maintenance Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.7

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains maintenance procedures for organizational systems to ensure system availability, security, and proper functioning. This policy establishes requirements for system maintenance, maintenance tool controls, and maintenance access controls.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.7 (Maintenance).

---

## 2. Scope

This policy applies to:
- All system maintenance activities
- All maintenance tools and personnel
- All maintenance access controls
- Application and infrastructure maintenance

**System Scope:** FCI and CUI environment.

---

## 3. Maintenance Requirements

### 3.1 Perform Maintenance (3.7.1)

**Requirement:** Perform maintenance on organizational systems.

**Implementation:**
- System maintenance performed by Microsoft Azure / CUI enclave VM (inherited for infrastructure)
- Application maintenance performed by organization
- Maintenance procedures documented
- Maintenance activities logged

**Maintenance Types:**
- Application code maintenance
- Dependency updates
- Database maintenance
- Infrastructure maintenance (inherited)

**Evidence:**
- Microsoft Azure / CUI enclave VM maintenance (inherited)
- System Maintenance section: SSP Section 10
- Maintenance procedures: SSP Section 10

**Status:** 🔄 Inherited (infrastructure), ✅ Implemented (application)

---

### 3.2 Controls on Maintenance Tools (3.7.2)

**Requirement:** Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.

**Implementation:**
- Maintenance tool control procedure to be established
- Maintenance tools approved and controlled
- Maintenance personnel authorized and supervised
- Maintenance tool controls documented

**Tool Controls:**
- Maintenance tools approved before use
- Maintenance tools controlled and monitored
- Maintenance personnel authorized
- Maintenance activities supervised

**Evidence:**
- Maintenance Tool Control Procedure: `MAC-SOP-238_Maintenance_Tool_Control_Procedure.md`
- Maintenance Tool Inventory: `../05-evidence/MAC-RPT-123_Maintenance_Tool_Inventory_Evidence.md`
- Tool Logging Implementation: `lib/maintenance-tool-logging.ts`

**Status:** ✅ Implemented

---

### 3.3 Sanitize Equipment for Off-Site Maintenance (3.7.3)

**Requirement:** Ensure equipment removed for off-site maintenance is sanitized of any CUI.

**Implementation:**
- System is cloud-based (no equipment removed for maintenance)
- No customer-managed equipment requiring off-site maintenance
- Equipment sanitization not applicable to system architecture

**Evidence:**
- System architecture: Cloud-based, no customer equipment

**Status:** 🚫 Not Applicable (cloud-only system, no equipment removal)

---

### 3.4 Check Maintenance Media (3.7.4)

**Requirement:** Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.

**Implementation:**
- System is cloud-based (no diagnostic media used)
- Maintenance performed via platform tools (no external media)
- Media checking not applicable to system architecture

**Evidence:**
- System architecture: Cloud-based maintenance

**Status:** 🚫 Not Applicable (cloud-only system, no diagnostic media)

---

### 3.5 MFA for Nonlocal Maintenance (3.7.5)

**Requirement:** Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.

**Implementation:**
- Maintenance access via Microsoft Azure / CUI enclave VM requires authentication
- MFA for maintenance sessions to be implemented
- Maintenance session termination enforced
- Nonlocal maintenance access controlled

**Evidence:**
- Microsoft Azure / CUI enclave VM authentication (inherited)
- Microsoft Azure / CUI enclave VM MFA (inherited)
- Maintenance MFA Evidence: `../05-evidence/MAC-RPT-110_Maintenance_MFA_Evidence.md`

**Status:** ✅ Fully Implemented (Inherited from Microsoft Azure / CUI enclave VM)

---

### 3.6 Supervise Maintenance Personnel (3.7.6)

**Requirement:** Supervise the maintenance activities of maintenance personnel without required access authorization.

**Implementation:**
- System is cloud-based (no on-site maintenance personnel)
- Maintenance performed by Microsoft Azure / CUI enclave VM (inherited)
- Supervision not applicable to system architecture

**Evidence:**
- System architecture: Cloud-based, platform maintenance

**Status:** 🚫 Not Applicable (cloud-only system, no on-site maintenance)

---

## 4. Maintenance Procedures

### 4.1 Application Maintenance

**Maintenance Activities:**
- Code updates and deployments
- Dependency updates
- Configuration changes
- Database migrations

**Maintenance Process:**
- Maintenance planned and scheduled
- Changes tested before deployment
- Maintenance performed during maintenance windows
- Maintenance verified after completion

---

### 4.2 Maintenance Documentation

**Maintenance Records:**
- Maintenance date and time
- Maintenance type and description
- Maintenance personnel
- Maintenance results
- Issues encountered

---

## 5. Roles and Responsibilities

### 5.1 System Administrator

**Responsibilities:**
- Perform application maintenance
- Coordinate maintenance activities
- Document maintenance activities
- Verify maintenance completion

### 5.2 Microsoft Azure / CUI enclave VM (Inherited)

**Responsibilities:**
- Perform infrastructure maintenance
- Manage platform updates
- Provide maintenance capabilities

---

## 6. Related Documents

- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 10, 7.10)
- Configuration Management Policy: `MAC-POL-220_Configuration_Management_Policy.md`

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2

---

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.7 (Maintenance)
- CMMC 2.0 Level 2 Assessment Guide
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-221-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-221-signoff.md`

