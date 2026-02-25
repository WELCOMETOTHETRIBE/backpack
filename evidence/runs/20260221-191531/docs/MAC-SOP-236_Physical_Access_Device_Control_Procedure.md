# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-236_Physical_Access_Device_Control_Procedure.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Physical Access Device Control Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.10.5

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes requirements for controlling and managing physical access devices used to control physical access to facilities and work areas where systems processing CUI are located.

---

## 2. Scope

This procedure applies to:
- Physical access devices (keys, cards, badges, etc.)
- Device inventory and management
- Device issuance and revocation
- Device tracking and accountability

---

## 3. Physical Access Device Management

### 3.1 Device Inventory

**Inventory Requirements:**
- All physical access devices inventoried
- Device type, serial number, and assignment recorded
- Device location and access level documented
- Inventory maintained and updated

**Inventory Records:**
- Device identifier
- Device type
- Assigned to (person or location)
- Issue date
- Status (active, lost, revoked)
- Return/revocation date

---

### 3.2 Device Issuance

**Issuance Process:**
1. Verify authorization for device
2. Record device assignment
3. Issue device to authorized personnel
4. Document issuance in inventory
5. Provide device usage instructions

**Issuance Requirements:**
- Authorization verified
- Device assigned to authorized personnel
- Issuance documented
- Device usage instructions provided

---

### 3.3 Device Revocation

**Revocation Triggers:**
- Personnel termination
- Access authorization revoked
- Device lost or stolen
- Security incident
- Device replacement

**Revocation Process:**
1. Identify device to revoke
2. Revoke device access
3. Recover device (if applicable)
4. Update inventory
5. Document revocation

---

## 4. Device Security

### 4.1 Device Protection

**Protection Requirements:**
- Devices stored securely when not in use
- Devices protected from unauthorized access
- Lost or stolen devices reported immediately
- Device security maintained

---

### 4.2 Device Accountability

**Accountability Requirements:**
- Device assignment tracked
- Device usage monitored (if applicable)
- Device return verified
- Device accountability maintained

---

## 5. Related Documents

- Physical Security Policy: `MAC-POL-212_Physical_Security_Policy.md`
- Physical Access Device Control Evidence: `../05-evidence/MAC-RPT-112_Physical_Access_Device_Evidence.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.8, 3.10.5)

---

## 6. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** 2026-04-23

**Change History:**
- Version 1.0 (2026-01-23): Initial procedure creation
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-236-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-236-signoff.md`



---
**QMS signature (SHA-256):** `2991b2e7afed14a6b59bb60cc528d9b2ae44d09a9fe185f742ec0edafd994cd4`
