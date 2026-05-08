# Procedures for Transmission Integrity (SMB Signing and Cryptographic Protection)

**Document ID:** MAC-SOP-242  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.15 (Protect authenticity of communications sessions)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how transmission integrity and authenticity of communications are ensured for the MacTech CUI enclave, with emphasis on SMB signing (and encryption where applicable) for file and print traffic involving the Windows VM(s), and TLS for management and remote access. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Azure Government and the Windows VM(s), with access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** SMB signing and, where applicable, SMB encryption on the Windows VM(s) and for any file/share access to or from the VM; TLS for RDP, management interfaces, and Entra ID/VPN authentication flows used for enclave access.
- **Out of scope:** Communications and applications entirely outside the Azure Government subscription and the Windows VM(s).

---

## 3. Prerequisites

- Administrative access to the Windows VM(s) to configure Group Policy or local security settings for SMB and network security.
- Understanding of SMB signing/encryption and TLS requirements (NIST SP 800-171, CMMC).

---

## 4. Procedure

### 4.1 SMB signing and encryption (Windows VM)

1. **SMB signing required.** Configure the Windows VM(s) to require SMB packet signing for both client and server. Path (GPO): Computer Configuration > Windows Settings > Security Settings > Local Policies > Security Options:
   - "Microsoft network server: Digitally sign communications (always)" — **Enabled.**
   - "Microsoft network client: Digitally sign communications (always)" — **Enabled.**
2. **SMB encryption (optional but recommended).** Where supported and operationally feasible, enable SMB encryption for CUI-related shares. Document any shares that use encryption and any that do not (and business justification).
3. **Evidence.** Retain screenshot or policy export showing SMB signing (and encryption if used) configuration. **Retention:** Minimum three (3) years.

### 4.2 TLS for remote access and management

1. **RDP.** Ensure RDP connections to the Windows VM(s) use TLS 1.2 or higher. This may be enforced via Azure Bastion, VPN, or RDP configuration on the VM. Document how RDP is protected (TLS/encryption).
2. **Entra ID and VPN.** Entra ID and MacTech’s VPN for enclave access use TLS for authentication and data in transit; document that enclave access relies on these protected channels.
3. **Management interfaces.** All Azure Portal, ARM, or other management access to the subscription and VM(s) shall use TLS. Unencrypted management channels are prohibited.

### 4.3 Review and verification

1. **Frequency.** Verify SMB and TLS-related settings at least annually and after any change to the VM baseline or network path.
2. **Evidence.** Retain dated evidence (screenshot or config export) of verification. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System administrator:** Configure and maintain SMB signing (and encryption) and ensure RDP/management use TLS; document configuration.
- **Security / Compliance:** Verify settings during assessments and ensure alignment with this procedure.

---

## 6. Evidence and Records

- Screenshots or exports of SMB signing (and encryption) GPO or local settings.
- Brief description or evidence of TLS use for RDP and management.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Identification and Authentication Policy (MAC-POL-211)
- Procedures for Remote Access (MAC-SOP-224)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
