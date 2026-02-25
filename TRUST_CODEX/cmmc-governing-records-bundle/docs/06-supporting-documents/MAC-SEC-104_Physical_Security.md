# Physical Security - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## Purpose

This document describes physical security controls for the MacTech Solutions system, including small office/home office (SOHO) environment controls, device security, and visitor procedures.

---

## Environment

**Type:** Small office/home office (SOHO) environment

**Description:** MacTech Solutions operates in a small office or home office environment where authorized personnel work remotely or in limited office settings.

---

## Physical Access Controls

### 1. Work Area Security

**Requirements:**
- Work areas must be in private, controlled spaces
- Work areas must be secured when unattended
- Screens must be positioned to prevent unauthorized viewing
- Sensitive information must not be left visible

**Implementation:**
- Locked rooms or private workspaces
- Screen locks enabled on devices
- Clean desk policy (no FCI left visible)

**Verification:** Review of work area security as needed

---

### 2. Device Security

**Requirements:**
- Devices must be password-protected
- Screen locks must be enabled with automatic timeout
- Devices must be kept secure when unattended

**Implementation:**
- All devices require password/PIN
- Screen lock timeout: 5 minutes or less
- Devices stored securely when not in use

**Verification:** Device security checklist (as needed)

---

### 3. Visitor Access

**Requirement:** Visitors must be escorted and supervised when in areas where FCI may be accessed or displayed.

**Implementation:**
- Visitors are identified before access
- Visitors are escorted by authorized personnel
- Visitors are supervised during entire visit
- Visitors are not left unattended
- Visitors do not access the system
- Visitors do not view FCI

**Procedure:**
1. Visitor arrives and is identified
2. Visitor is authorized by authorized personnel
3. Visitor is escorted by authorized personnel
4. Visitor is supervised during entire visit
5. Visitor is not left unattended
6. Visitor does not access system or view FCI
7. Visitor is escorted out when visit concludes

**Monitoring:** Direct supervision (truthful statement - no formal visitor logs unless actually used)

---

## Remote Work Controls

**Environment:** Work-from-home locations

**Requirements:**
- Work area must be private and controlled
- Devices must meet security requirements
- Network must be secured (WPA2/WPA3)
- FCI is not stored on local devices (cloud-only)

**Implementation:**
- Private workspace in home
- Secured home network
- Device security (password, screen lock)
- No local FCI storage

**Evidence:** See `Physical_Environment_and_Remote_Work_Controls.md`

---

## Cloud Infrastructure Physical Security

**Provider:** Microsoft Azure

**Inherited Control:** Microsoft Azure provides physical security for all cloud infrastructure, including:
- Data center physical access controls
- Environmental controls (temperature, humidity, fire suppression)
- Facility security (guards, surveillance, access logs)
- Redundant power and cooling systems

**Organization Responsibility:** Organization relies on Microsoft Azure for physical security of cloud infrastructure. Organization does not claim responsibility for Microsoft Azure's physical security posture.

**Evidence:** Microsoft Azure documentation; inherited control statements (see SSP Section 6).

---

## Device Inventory (Future Enhancement)

**Status:** Formal device inventory and tracking may be implemented as a future enhancement.

**Current:** Device security requirements are procedurally enforced. Devices are identified and secured per organizational procedures.

---

## Visitor Logging (Future Enhancement)

**Status:** Formal visitor logs may be implemented as a future enhancement.

**Current:** Visitor access is managed via escort and supervision procedures. No formal visitor logs are maintained unless actually used.

---

## Compliance Risks & Open Items

### 1. Visitor Logging

**Status:** Visitor logging is not currently implemented. Visitor access is managed via escort and supervision. Formal visitor logs may be implemented as a future enhancement.

---

### 2. Device Inventory

**Status:** Formal device inventory and tracking may be implemented as a future enhancement. Current focus is on ensuring devices meet security requirements.

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---

## Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

## Appendix A: Related Documents

- Physical Environment and Remote Work Controls (`../cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md`)
- Inherited control statements for Microsoft Azure (see SSP Section 6)
- Endpoint Protection (`MAC-SEC-101_Endpoint_Protection.md`)
