# Procedures for Session and Connection Termination

**Document ID:** MAC-SOP-240  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.9 (Terminate network connections/sessions)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how session and connection termination are implemented for the MacTech CUI enclave so that network sessions (e.g., RDP to the Windows VM) are terminated after a defined period of inactivity or at logoff. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Remote Desktop (RDP) sessions to the Windows VM(s); VPN session limits if managed by MacTech for enclave access; lock/screen-saver and session timeout settings on the Windows VM(s).
- **Out of scope:** Session timeouts on systems outside the Azure Government subscription.

---

## 3. Prerequisites

- Administrative access to configure the Windows VM(s) (Group Policy or local security policy).
- Timeout values as specified in this procedure (approved by CISO or designated System Owner).

---

## 4. Procedure

### 4.1 RDP session timeouts (Windows VM)

1. **Configure idle session timeout.** Set Remote Desktop Services (RDP) idle session timeout on the Windows VM(s) to **15 minutes** maximum. Path: Computer Configuration > Administrative Templates > Windows Components > Remote Desktop Services > Remote Desktop Session Host > Session Time Limits. Set "Set time limit for active Remote Desktop Services sessions" and "Set time limit for idle sessions" as appropriate.
2. **Disconnect vs. end session.** Configure "End session when time limits are reached" or "Disconnect when time limits are reached" per organizational preference. Disconnected sessions shall be limited to **30 minutes** before the session is ended (configurable via "Set time limit for disconnected sessions").
3. **Documentation.** Document the configured values (GPO or local policy) and retain screenshots or policy export for assessment evidence.

### 4.2 Lock and screen-saver (Windows VM)

1. **Screen lock.** Require automatic screen lock after **15 minutes** of inactivity on the Windows VM(s). Configure via Group Policy: Computer Configuration > Windows Settings > Security Settings > Local Policies > Security Options (e.g., "Interactive logon: Machine inactivity limit") and screen-saver with "On resume, display logon screen."
2. **Retain evidence.** Retain configuration export or screenshot for assessor review.

### 4.3 VPN session limits (if applicable)

1. If VPN for enclave access is managed by MacTech, configure session idle timeout and maximum session duration per organizational standards. Document the values and where they are configured.
2. If VPN is managed by a third party (e.g., Azure VPN Gateway with Entra), document the applicable session behavior and any configurable limits.

### 4.4 Review and verification

1. **Frequency.** Verify RDP and lock/screen-saver settings at least annually or after any change to the VM baseline.
2. **Evidence.** Maintain a log or dated evidence of verification (screenshot or config export). Retain for minimum three (3) years.

---

## 5. Roles and Responsibilities

- **System administrator:** Configure and maintain RDP and lock/screen-saver settings on the Windows VM(s); document settings.
- **Security / Compliance:** Verify settings during assessments and ensure alignment with this procedure.

---

## 6. Evidence and Records

- Screenshots or exports of RDP session time limits and lock/screen-saver configuration.
- Log of annual (or periodic) verification.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Procedures for Remote Access (MAC-SOP-224)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
