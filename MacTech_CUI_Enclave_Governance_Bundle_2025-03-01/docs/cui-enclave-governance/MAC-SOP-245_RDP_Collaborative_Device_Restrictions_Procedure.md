# Procedures for RDP and Collaborative Device Use and Restrictions

**Document ID:** MAC-SOP-245  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.12 (Collaborative computing devices — control and monitoring)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how Remote Desktop (RDP) access to the MacTech CUI enclave Windows VM(s) is used and how collaborative computing devices and features (e.g., camera, microphone, screen sharing) are restricted on the in-scope system. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** RDP as the primary remote access method to the Windows VM(s); configuration of the Windows VM(s) to disable or restrict camera, microphone, and other collaborative device features that could capture or transmit CUI in an uncontrolled manner; RDP-specific security settings (e.g., session timeout per MAC-SOP-240, connection limits).
- **Out of scope:** Collaborative device or camera/mic policies on user work computers unless explicitly referenced as an organizational standard for enclave access devices.

---

## 3. Prerequisites

- Administrative access to the Windows VM(s) to configure Group Policy or local policy.
- Camera and microphone are disabled by default on the CUI VM unless an exception is documented and approved.

---

## 4. Procedure

### 4.1 RDP as authorized remote access

1. **Standard method.** RDP over MacTech’s VPN (and Entra ID + MFA) is the **only** authorized method for users to access the Windows VM(s) for CUI work. Document that RDP is the only supported remote desktop method for the enclave (no unapproved remote control or screen-sharing tools).
2. **Hardening.** Apply RDP hardening: TLS for RDP (Network Level Authentication, NLA), session timeouts per MAC-SOP-240, and restrict RDP to authorized users/groups. Document the settings (GPO or local policy).
3. **No direct internet RDP.** The VM(s) shall **not** have RDP directly exposed to the internet; access is only through VPN (and optionally Azure Bastion for administrators). Document how RDP exposure is limited (e.g., NSG rules, no public IP on VM).

### 4.2 Restrict camera and microphone on the VM

1. **Disable or restrict.** On the Windows VM(s), disable or severely restrict camera and microphone access via Group Policy or device management:
   - **Camera:** Disable unless a specific, approved use case exists (document and approve any exception via change control).
   - **Microphone:** Disable unless a specific, approved use case exists (document and approve any exception via change control).
2. **GPO path (example).** Computer Configuration > Administrative Templates > Windows Components > Camera (or equivalent); use "Turn off Microsoft Camera Forwarding" and similar to prevent RDP from forwarding camera/mic from client if not desired. Alternatively, disable camera/mic devices at the VM level so the VM itself has no such devices. Document the chosen approach.
3. **Evidence.** Retain screenshot or policy export showing camera/mic restriction configuration. **Retention:** Minimum three (3) years.

### 4.3 Restrict other collaborative features

1. **Clipboard and drive redirection.** Control RDP clipboard and local drive redirection to prevent unauthorized copy of CUI to the client device. Configure via RDP settings or GPO (e.g., "Do not allow clipboard redirection" for CUI sessions, or allow only with documented approval). Document the policy.
2. **Screen sharing / remote control.** Only RDP (and any approved management tool, e.g., Azure Bastion) shall be used for remote access to the VM. Unapproved screen-sharing or remote-control software shall not be installed on the VM. Document that no other collaborative remote control is in use.

### 4.4 Review and verification

1. **Frequency.** Review RDP and camera/mic/collaborative settings at least annually or after VM baseline changes.
2. **Evidence.** Retain dated evidence (screenshot or config export) of verification. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System administrator:** Configure and maintain RDP, camera/mic, and collaborative feature restrictions on the Windows VM(s); document configuration.
- **Security / Compliance:** Verify settings during assessments and ensure alignment with this procedure.

---

## 6. Evidence and Records

- Screenshots or exports of GPO (or equivalent) for RDP, camera, microphone, and clipboard/drive redirection.
- Brief narrative of approved vs. restricted collaborative features.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Procedures for Session and Connection Termination (MAC-SOP-240)
- Procedures for Remote Access (MAC-SOP-224)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
