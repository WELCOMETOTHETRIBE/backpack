# C3PAO Assessment Findings Report

## 1. Introduction
This report details the findings of a C3PAO-style interrogation of the system identified as `cui-win-pilot-0`, based on the provided CUI Pilot Validation Report. The assessment aimed to evaluate the system's adherence to selected CMMC 2.0 Level 2 practices, with a focus on identifying critical compliance gaps that would impact accreditation.

## 2. Executive Summary
The system `cui-win-pilot-0` underwent an automated validation process, successfully passing 38 out of 39 checks relevant to CMMC 2.0 Level 2. While the system demonstrated strong technical controls in numerous areas, a significant deficiency was identified in the implementation of Access Control practice AC.L2-3.1.3, specifically concerning Remote Desktop Protocol (RDP) configuration. This critical failure prevents a recommendation for CMMC Level 2 accreditation in the system's current state.

## 3. Detailed Findings

### 3.1. Critical Non-Compliance: AC.L2-3.1.3 - Control the flow of CUI in accordance with approved authorizations.

**Finding**: The validation report indicates that Network Level Authentication (NLA) for RDP sessions is disabled (`NLA(UserAuthentication)=0`).

**Requirement**: CMMC 2.0 Level 2, derived from NIST SP 800-171, mandates robust access controls to protect CUI. Enabling NLA is a fundamental security measure that requires users to authenticate before a full RDP session is established, thereby mitigating risks associated with unauthenticated access attempts and certain types of Man-in-the-Middle (MitM) attacks. While the system correctly disabled clipboard and drive redirection, the absence of NLA creates a significant vulnerability.

**Impact**: The disabled NLA exposes the system to increased risk of unauthorized access, denial-of-service attacks, and potential exploitation of RDP vulnerabilities before user authentication. This directly compromises the confidentiality, integrity, and availability of CUI and the information system itself. This finding represents a **critical deficiency** that must be remediated prior to any consideration for CMMC Level 2 accreditation.

### 3.2. Areas of Strong Compliance

Despite the critical finding, the system demonstrated commendable adherence to several other CMMC Level 2 practices:

*   **SC.L2-3.13.11 - Employ FIPS-validated cryptography**: The system correctly reported FIPS mode as enabled (`Enabled=1`), ensuring that cryptographic modules used for protecting CUI meet federal standards.
*   **SC.L2-3.13.8 - Protect the integrity of CUI transmitted or otherwise communicated over networks**: The system successfully demonstrated compliance with TLS baseline requirements, with TLS 1.0/1.1 disabled and TLS 1.2 enabled, thereby safeguarding data in transit.
*   **AU.L2-3.3.1 - Create and retain information system audit records**: Comprehensive audit logging was enabled, with security audit logs active, audit policies queryable, and subcategories configured for both success and failure events. Event log maximum sizes met baseline requirements (Security >= 256MB; System/Application >= 64MB), indicating sufficient capacity for forensic analysis.
*   **MP.L2-3.8.1 - Protect (i.e., physically control and securely store) information system media containing CUI**: BitLocker was fully enabled and active for the operating system volume, providing robust encryption for CUI at rest.
*   **IA.L2-3.5.8 - Define and enforce a minimum password complexity and change of characters when new passwords are created**: The password history was configured to retain 24 previous passwords, exceeding typical baseline requirements and enhancing password hygiene.
*   **IA.L2-3.5.1 - Identify information system users, processes acting on behalf of users, or devices**: The Guest account was disabled, and automatic logon was not enabled, demonstrating good identity hygiene.
*   **AC.L2-3.1.5 - Employ the principle of least privilege**: User Account Control (UAC) prompts were enabled for administrators, ensuring that privileged actions require explicit consent.
*   **AC.L2-3.1.9 - Provide privacy and security notices consistent with applicable CUI rules**: An interactive logon notice with both caption and text was configured, providing appropriate legal and security warnings to users.
*   **AC.L2-3.1.11 - Terminate a user session after a defined condition**: A machine inactivity limit was configured (`InactivityTimeoutSecs=900`), ensuring sessions are terminated after a period of inactivity.
*   **AC.L2-3.1.10 - Protect the confidentiality and integrity of CUI at rest**: Session lock was configured (secure screen saver enabled with timeout), further protecting CUI when systems are unattended.
*   **AC.L2-3.1.12 - Control and monitor remote access sessions**: Windows Remote Management (WinRM) was disabled, reducing the attack surface for remote access.
*   **AC.L2-3.1.8 - Limit unsuccessful logon attempts**: The account lockout threshold was set to a finite number (5), preventing brute-force attacks.
*   **CM.L2-3.4.2 - Establish and enforce security configuration settings**: Local security policy exports were present and parseable, indicating proper configuration management practices.
*   **SC.L2-3.13.1 - Monitor, control, and protect organizational communications**: The network boundary was enforced with a firewall baseline, and SMB signing was required, enhancing network communication security.
*   **SI.L2-3.14.2 - Provide protection from malicious code**: Defender real-time protection was enabled and up-to-date, providing essential anti-malware capabilities.
*   **MP.L2-3.8.7 - Control the use of removable media**: USB mass storage was disabled, limiting data exfiltration risks.

## 4. C3PAO Judgment and Recommendation

Based on the comprehensive analysis of the CUI Pilot Validation Report, the system `cui-win-pilot-0` is **NOT RECOMMENDED for CMMC 2.0 Level 2 accreditation at this time**.

The single critical failure related to **AC.L2-3.1.3 (NLA disabled for RDP)** represents an unacceptable risk to the confidentiality, integrity, and availability of CUI. This deficiency must be immediately addressed and verified through a subsequent assessment.

**Recommendation**: The Organization Seeking Certification (OSC) must enable Network Level Authentication (NLA) for all RDP sessions. Following remediation, a re-assessment of AC.L2-3.1.3 is required to confirm the effectiveness of the implemented control. All other identified areas of strong compliance should be maintained and continuously monitored.

## 5. References

*   CUI Pilot Validation Report (Provided by User)
*   CMMC 2.0 Model, Level 2 (NIST SP 800-171 Rev 2)
*   NIST SP 800-171A, Assessing Security Requirements for Controlled Unclassified Information

## 6. Remediation (AC.L2-3.1.3 – NLA)

The critical finding (NLA disabled) has been addressed in the pilot tooling:

- **Hardening**: `Invoke-CuiHardening.ps1` now sets RDP **UserAuthentication** to **1** (DWord) in both the runtime key (`HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp`) and the policy key (`HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Server\WinStations\RDP-Tcp`), using `New-ItemProperty -PropertyType DWord -Force` so the value is stored as DWord and the validator’s RDP-REDIR check can pass.
- **One-off fix**: For VMs where full hardening is not desired, `Set-RdpNla.ps1` applies only the NLA fix (run as Administrator):  
  `powershell -ExecutionPolicy Bypass -File C:\hardening\Set-RdpNla.ps1`
- **Re-verification**: After applying hardening or the NLA script, run evidence collection and validation again; RDP-REDIR should report PASS. See TRUST_CODEX/docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md and TRUST_CODEX/docs/EVIDENCE_RUNBOOK.md.
