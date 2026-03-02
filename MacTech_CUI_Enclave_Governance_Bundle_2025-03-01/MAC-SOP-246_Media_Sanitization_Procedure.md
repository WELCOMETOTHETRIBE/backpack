# Procedures for Media Sanitization

**Document ID:** MAC-SOP-246  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.8.3 (Sanitize media); SC.L2-3.8.7 (Disposal of equipment)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave sanitizes and disposes of media and equipment that have held CUI, so that CUI cannot be recovered after release or disposal. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Sanitization of storage media used within the enclave (e.g., VM disks, Azure-managed disks, backup storage); disposal of equipment that has processed or stored CUI; verification and documentation of sanitization/disposal; printed material containing CUI (if any).
- **Out of scope:** Media and equipment outside the Azure Government subscription; user work computers used only to access the enclave (governed by policy and MAC-FRM-204).

---

## 3. Prerequisites

- Media Handling & Data Disposal Policy (MAC-POL-213) or equivalent in effect.
- Authority to sanitize or deallocate Azure resources and to document actions.
- Defined sanitization methods (clear, purge, destroy) per NIST SP 800-88 Rev. 1 or organizational standard.

---

## 4. Procedure

### 4.1 Sanitization methods

1. **Clear.** Overwrite storage with a single pass of a fixed pattern or random data so that data is not recoverable using standard read mechanisms. Use for reusable media that will remain in the enclave (e.g., VM disk before reimage) when purge or destroy is not required.
2. **Purge.** Apply physical or logical techniques that make target data recovery infeasible (e.g., cryptographic erase where keys are destroyed; multiple overwrite; secure erase). Use when media will be released outside the enclave or repurposed for non-CUI use.
3. **Destroy.** Physically destroy media (e.g., disintegration, incineration, shredding) or render it unusable. Use when media cannot be purged to the required level or when policy requires destruction.

### 4.2 VM and Azure storage

1. **Deallocation and cryptographic erase.** Before deallocating or deleting Azure disks or snapshots that have held CUI, use Azure capabilities (e.g., delete disk/snapshot; ensure no remaining copies). For customer-managed keys, document key destruction or rotation so that previous content is unrecoverable. Document the action (resource ID, date, method).
2. **Backup and replica media.** Ensure backup and replica storage used for CUI is either retained under controlled access or sanitized (purge/destroy) before release. Document retention or sanitization for each backup set or replica that has held CUI.

### 4.3 Printed material and removable media

1. **Printed CUI.** If CUI is printed, shred or destroy printed material using a cross-cut shredder or approved destruction method before disposal. Do not place in unsecured recycling or trash. Document destruction in accordance with Records Retention Policy if required.
2. **Removable media.** Per MAC-POL-213, removable media is not used for CUI storage within the enclave. If any removable media is ever used for CUI (e.g., exception), sanitize per 4.1 before release and document.

### 4.4 Disposal of equipment

1. **Equipment that has processed or stored CUI.** Before disposal, transfer, or release of equipment (e.g., failed disks returned to vendor), sanitize all storage per 4.1 so that CUI cannot be recovered. Obtain certificate of destruction or sanitization from vendor when applicable. Retain documentation.
2. **Azure and VM.** When Windows VM(s) or Azure resources are decommissioned, complete deallocation and deletion of disks and ensure no residual CUI (per 4.2). Document decommissioning and any sanitization steps.

### 4.5 Verification and records

1. **Verification.** Where feasible, verify that sanitization completed successfully (e.g., Azure confirmation of delete; log of secure erase). For destruction, retain certificate or log.
2. **Records.** Maintain a sanitization and disposal log (media/equipment identifier, date, method, responsible party). **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/asset owner or administrator:** Execute sanitization and disposal; document actions and retain evidence.
- **Security / Compliance:** Verify procedure is followed during assessments; ensure alignment with MAC-POL-213.
- **Users:** Do not remove media or printed CUI from the enclave without following this procedure; report lost or misplaced media per incident procedures.

---

## 6. Evidence and Records

- Sanitization and disposal log (media/equipment, date, method, responsible party).
- Azure/VM deallocation or deletion records; certificates of destruction where applicable.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Media Handling & Data Disposal Policy (MAC-POL-213)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
