# Cryptographic Key Management Procedure

**Document ID:** MAC-SOP-251  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.10 (Cryptographic protection); SC.L2-3.13.11 (Key management)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave generates, stores, distributes, rotates, and destroys cryptographic keys used to protect CUI, and how key access and recovery are controlled. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Keys used to protect CUI at rest and in transit within the enclave (e.g., Azure Storage encryption keys, VM disk encryption, TLS/HTTPS, application-level encryption); key storage (Azure Key Vault or managed keys); key access control; key rotation and destruction; key recovery procedures.
- **Out of scope:** Keys used only outside the CUI enclave boundary; classified key management (not applicable to CUI).

---

## 3. Prerequisites

- System and Communications Protection Policy (MAC-POL-225); use of FIPS-validated or approved cryptography per policy; Azure Key Vault or Azure-managed keys where applicable; defined roles for key access and recovery.

---

## 4. Procedure

### 4.1 Key generation and storage

1. **Generation.** Cryptographic keys shall be generated using approved methods (e.g., FIPS-validated modules, Azure Key Vault HSM or software). Document where and how keys are generated (e.g., Key Vault, Windows DPAPI for local keys).
2. **Storage.** Keys shall be stored in a secure manner. Prefer Azure Key Vault (or Key Vault HSM) for keys that protect enclave data; use access policies or RBAC so that only authorized identities can use or export keys. Document key storage locations and access controls.

### 4.2 Key distribution and access

1. **Access control.** Only authorized personnel or system identities may access keys (use, export, or manage). Use Azure RBAC and Key Vault access policies to enforce least privilege. Document who (or which service principals) have key access and for what purpose.
2. **Distribution.** When keys must be distributed (e.g., to a trusted system), use secure channels and minimal distribution. Prefer key exchange or derivation over sharing raw keys. Document distribution only when required for operations or recovery.

### 4.3 Key rotation and destruction

1. **Rotation.** Rotate cryptographic keys in accordance with policy and risk (e.g., annually or after a compromise or personnel change). For Azure Key Vault, use key versioning and update applications to use new versions; for Azure-managed keys (e.g., platform-managed disk encryption), rotation is handled by Azure—document the approach. Retain records of rotation dates.
2. **Destruction.** When keys are no longer needed (e.g., decommissioning, key replacement), destroy or revoke them so that data previously protected cannot be decrypted by unauthorized parties. For Key Vault, disable or delete keys per Azure procedures; document destruction. For Media Sanitization (MAC-SOP-246), key destruction may be part of sanitization (cryptographic erase).

### 4.4 Azure-managed vs. customer-managed keys

1. **Platform-managed.** Where Azure manages keys (e.g., default encryption for Azure Storage or VM disks), document that encryption is in place and that key management is inherited from Azure. Ensure Azure Government and approved regions are used.
2. **Customer-managed.** Where MacTech manages keys (e.g., customer-managed keys in Key Vault for storage or disk encryption), document key lifecycle (generation, storage, rotation, destruction) and access control per 4.1–4.3.

### 4.5 Key recovery

1. **Recovery procedure.** Define and document key recovery steps for scenarios where key access is lost (e.g., key backup, recovery agent). Ensure recovery does not weaken access control; only designated roles may perform recovery. Test or review recovery procedure periodically.
2. **Backup.** If key material is backed up, store backups in a secure, access-controlled location (e.g., separate Key Vault, offline HSM). Document backup and recovery in the key management plan or this procedure.

### 4.6 Review and verification

1. **Frequency.** Review key inventory, access, and rotation at least annually or after any incident involving keys.
2. **Evidence.** Retain key management plan or summary (storage locations, roles, rotation schedule); access and rotation records. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/security administrator:** Configure Key Vault and key access; perform or oversee key rotation and destruction; document key lifecycle.
- **Security / Compliance:** Verify key management during assessments; ensure alignment with MAC-POL-225.
- **Application/system owners:** Use keys only per this procedure; do not export or share keys outside approved channels.

---

## 6. Evidence and Records

- Key management plan or procedure summary (key types, storage, access, rotation).
- Key Vault access configuration; rotation and destruction records.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- System and Communications Protection Policy (MAC-POL-225)
- Procedures for Media Sanitization (MAC-SOP-246)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
