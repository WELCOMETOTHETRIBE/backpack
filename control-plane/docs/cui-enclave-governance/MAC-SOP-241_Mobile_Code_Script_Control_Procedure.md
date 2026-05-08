# Procedures for Mobile Code and Script Control

**Document ID:** MAC-SOP-241  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.13 (Control and authorize mobile code)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how mobile code (e.g., scripts, JavaScript, VBScript, ActiveX, and other executable content from untrusted sources) is controlled and authorized on the MacTech CUI enclave. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s) hosted within it.

---

## 2. Scope

- **In scope:** The Windows VM(s) in the enclave: browser and application settings that affect mobile code execution; Microsoft Defender Attack Surface Reduction (ASR) or equivalent controls; Group Policy or configuration that restricts unauthorized mobile code. Authorized use of scripts (e.g., administrative PowerShell) under change control per MAC-POL-220.
- **Out of scope:** User work computers and systems outside the Azure Government subscription.

---

## 3. Prerequisites

- Administrative access to the Windows VM(s) to configure GPO, Defender ASR, or application settings.
- List of authorized scripting/automation use cases maintained per Configuration Management Policy (MAC-POL-220).

---

## 4. Procedure

### 4.1 Restrict mobile code execution (Windows VM)

1. **Browser and application settings.** On the Windows VM(s), restrict execution of mobile code (ActiveX, JavaScript/VBScript launching executables, etc.) via Group Policy or application configuration. Use deny-by-default where possible; allow only for approved, necessary use cases.
2. **Microsoft Defender ASR.** Enable and maintain Attack Surface Reduction rules that block or constrain mobile code (e.g., "Block JavaScript or VBScript from launching downloaded executable content," "Block executable content from email client and webmail") per MacTech risk acceptance. Document enabled rules and any exceptions in the approved script/use-case register.
3. **Script execution policy (PowerShell).** Set PowerShell execution policy on the VM(s) to restrict unsigned or remote scripts except where required for approved administration (e.g., RemoteSigned or AllSigned with approved code-signing). Document the policy and any bypass procedures (e.g., signed scripts only, specific paths).

### 4.2 Authorize required mobile code

1. **Approved use cases.** Maintain a register (or reference to the change control process) of approved scripts or mobile code use cases (e.g., deployment scripts, monitoring agents) permitted on the Windows VM(s). Approval shall be per Configuration Management Policy (MAC-POL-220).
2. **Execution path and integrity.** Where scripts must run, use signed scripts or restricted execution paths and document how integrity is assured (e.g., code signing, hash verification).

### 4.3 Review and update

1. **Frequency.** Review mobile code and script controls at least annually and after any security incident involving malicious code or unauthorized scripting.
2. **Evidence.** Retain screenshots or exports of ASR rules, GPO settings, and PowerShell execution policy for assessor review. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System administrator:** Configure and maintain GPO, Defender ASR, and script execution policy on the Windows VM(s); document settings and exceptions.
- **Change control / Security:** Approve authorized script use cases; verify alignment with Configuration Management and this procedure.

---

## 6. Evidence and Records

- Screenshots or exports of Defender ASR rules and GPO (or equivalent) settings for mobile code/script control.
- List or register of approved scripts/use cases.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- System and Information Integrity Policy (MAC-POL-214) / Procedures for Malicious Code Protection
- Configuration Management Policy (MAC-POL-220)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
