# Governance Document Inventory and Gap Analysis

**Generated:** 2026-02-28

This document maps required governance artifacts (from the artifact guide and OS evidence manifest) to existing documents in the mactech repository. Paths are relative to the **mactech** repo root.

## Matrix: Part 1 — 18 governance controls

| Control ID | Title | Have document? |
|------------|-------|----------------|
| 3.1.4 | Separate Duties | Yes |
| 3.2.1 | Security Awareness Training | No |
| 3.2.2 | Security Training for Significant Security Responsibilities | No |
| 3.2.3 | Insider Threat Awareness Training | No |
| 3.3.3 | Review and Update Logged Events | Yes |
| 3.4.3 | Change Control | Yes |
| 3.4.4 | Security Impact Analysis | Yes |
| 3.6.1 | Operational Incident-Handling Capability | Yes |
| 3.6.2 | Track, Document, and Report Incidents | No |
| 3.6.3 | Test Incident Response Capability | Yes |
| 3.7.6 | Supervise Maintenance Personnel | Yes |
| 3.9.1 | Screen Individuals Prior to Access | Yes |
| 3.9.2 | Protect Systems During/After Personnel Actions | Yes |
| 3.11.1 | Periodically Assess Risk | Yes |
| 3.12.1 | Periodically Assess Security Controls | Yes |
| 3.12.2 | Develop and Implement Plan of Action & Milestones (POA&M) | No |
| 3.12.3 | Monitor Security Controls | No |
| 3.12.4 | Develop/Update System Security Plan | Yes |

## Matrix: Part 2 — 31 PARTIAL controls (OS validation)

| Control ID | Title | Have document? |
|------------|-------|----------------|
| AC.L2-3.1.22 | Control CUI on public systems | Yes |
| AU.L2-3.3.5 | Correlate audit records | No |
| AU.L2-3.3.6 | Audit record reduction/reporting | No |
| CM.L2-3.4.3 | Change control | Yes |
| CM.L2-3.4.5 | Change access restrictions | No |
| IA.L2-3.5.3 | MFA for privileged accounts | Yes |
| IA.L2-3.5.4 | Replay-resistant authentication | Yes |
| IA.L2-3.5.6 | Disable identifiers after inactivity | No |
| IA.L2-3.5.9 | Temporary passwords | Yes |
| IA.L2-3.5.10 | Cryptographically-protected passwords | Yes |
| IA.L2-3.5.11 | Obscure authentication feedback | No |
| MA.L2-3.7.1 | Perform maintenance | Yes |
| MA.L2-3.7.2 | Controls on maintenance tools | No |
| MA.L2-3.7.5 | MFA for nonlocal maintenance | Yes |
| MP.L2-3.8.1 | Protect system media | Yes |
| MP.L2-3.8.2 | Limit access to CUI on media | Yes |
| MP.L2-3.8.5 | Control access during transport | Yes |
| MP.L2-3.8.8 | Prohibit portable storage without owner | Yes |
| RA.L2-3.11.2 | Scan for vulnerabilities | Yes |
| RA.L2-3.11.3 | Remediate vulnerabilities | Yes |
| SC.L2-3.13.2 | Architectural designs | Yes |
| SC.L2-3.13.3 | Separate user/system management | No |
| SC.L2-3.13.4 | Prevent unauthorized information transfer | No |
| SC.L2-3.13.5 | Implement subnetworks | No |
| SC.L2-3.13.9 | Terminate network connections | No |
| SC.L2-3.13.10 | Cryptographic key management | No |
| SC.L2-3.13.12 | Collaborative computing devices | No |
| SC.L2-3.13.13 | Control mobile code | No |
| SC.L2-3.13.15 | Protect authenticity of communications | No |
| SI.L2-3.14.3 | Monitor security alerts | No |
| SI.L2-3.14.7 | Identify unauthorized use | No |

---

## Part 1: 18 governance controls — detail

Required governance docs per control (from artifact guide or CMMC 18 Governance analysis). Paths relative to mactech repo.

| Control ID | Title | Required governance docs | Our document(s) | Status |
|------------|-------|---------------------------|-----------------|--------|
| 3.1.4 | Separate Duties | Access Control Policy; Procedures for Separation of Duties; List of defined roles and responsibilities requiring separation | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-235_Separation_of_Duties_Matrix.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-235_Separation_of_Duties_Matrix.md | Met |
| 3.2.1 | Security Awareness Training | Security Awareness and Training Policy; Procedures for Security Awareness Training; Security Awareness Training Curriculum & Materials; Training records for all users, managers, and administrators | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-219_Awareness_and_Training_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-227_Security_Awareness_Training_Procedure.md; MISSING; MISSING | Missing |
| 3.2.2 | Security Training for Significant Security Responsibilities | Procedures for Role-Based Security Training; Role-Based Training Curriculum & Materials; List of personnel with assigned security roles; Training records for all personnel with security responsibilities | MISSING; MISSING; MISSING; MISSING | Missing |
| 3.2.3 | Insider Threat Awareness Training | Insider Threat Policy & Procedures; Insider Threat Training Materials; Training records demonstrating insider threat awareness training | MISSING; MISSING; MISSING | Missing |
| 3.3.3 | Review and Update Logged Events | Audit and Accountability Policy; Audit Log Review Procedure | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-218_Audit_and_Accountability_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-226_Audit_Log_Review_Procedure.md | Met |
| 3.4.3 | Change Control | Configuration Management Policy | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md | Met |
| 3.4.4 | Security Impact Analysis | Configuration Management Policy; Configuration Change Procedure | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-225_Configuration_Change_Awareness_Procedure.md | Met |
| 3.6.1 | Operational Incident-Handling Capability | Incident Response Policy; Incident Response Plan; Procedures for Incident Handling | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-215_Incident_Response_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-IRP-001_Incident_Response_Plan.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md | Met |
| 3.6.2 | Track, Document, and Report Incidents | Procedures for Incident Reporting; Incident response training materials and records | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md; MISSING | Missing |
| 3.6.3 | Test Incident Response Capability | Procedures for Incident Response Testing; Incident response test plans and results | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-232_Incident_Response_Testing_Procedure.md; compliance/cmmc/level2/05-evidence/ | Met |
| 3.7.6 | Supervise Maintenance Personnel | Procedures for Media Sanitization; Records of media sanitization | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md; compliance/cmmc/level2/05-evidence/ | Met |
| 3.9.1 | Screen Individuals Prior to Access | Personnel Security Policy; Procedures for Personnel Screening; Records of personnel screening | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-222_Personnel_Security_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-233_Personnel_Screening_Procedure.md; compliance/cmmc/level2/05-evidence/ | Met |
| 3.9.2 | Protect Systems During/After Personnel Actions | Procedures for Personnel Termination and Transfer; Records of actions taken upon personnel termination or transfer | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-234_Personnel_Termination_Procedure.md; compliance/cmmc/level2/05-evidence/ | Met |
| 3.11.1 | Periodically Assess Risk | Risk Assessment Policy; Procedures for Risk Assessment; Risk assessment reports; Records of vulnerability scans | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-223_Risk_Assessment_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-229_Risk_Assessment_Procedure.md; compliance/cmmc/level2/05-evidence/; compliance/cmmc/level2/05-evidence/ | Met |
| 3.12.1 | Periodically Assess Security Controls | Security Assessment and Authorization Policy; Procedures for Security Assessments; Security assessment plans; Security assessment reports | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-224_Security_Assessment_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-224_Security_Assessment_Policy.md; compliance/cmmc/level2/05-evidence/; compliance/cmmc/level2/05-evidence/ | Met |
| 3.12.2 | Develop and Implement Plan of Action & Milestones (POA&M) | Procedures for Plan of Action and Milestones (POA&M); POA&M Document | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-231_POA&M_Process_Procedure.md; MISSING | Missing |
| 3.12.3 | Monitor Security Controls | Procedures for Continuous Monitoring; Continuous monitoring plan; Records of continuous monitoring activities | MISSING; compliance/cmmc/level2/01-system-scope/; compliance/cmmc/level2/05-evidence/ | Missing |
| 3.12.4 | Develop/Update System Security Plan | Security Planning Policy; Procedures for System Security Plan Development and Review; Records of SSP reviews and updates | compliance/cmmc/level2/01-system-scope/MAC-IT-304_System_Security_Plan.md; compliance/cmmc/level2/01-system-scope/; compliance/cmmc/level2/05-evidence/ | Met |

---

## Part 2: 31 PARTIAL controls (OS validation) — detail

These controls have technical evidence from the OS run but require additional governance docs, logs, or records to close.

| Control ID | Title | Docs to close PARTIAL | Our document(s) | Status |
|------------|-------|------------------------|-----------------|--------|
| AC.L2-3.1.22 | Control CUI on public systems | Procedures for CUI Handling | compliance/cmmc/level2/02-policies-and-procedures/MAC-FRM-204_CUI_Enclave_User_Agreement_and_Rules_of_Behavior.md | Met |
| AU.L2-3.3.5 | Correlate audit records | Procedures for Audit Record Protection; List of individuals with authorized access to audit records | MISSING; MISSING | Missing |
| AU.L2-3.3.6 | Audit record reduction/reporting | Procedures for Limiting Audit Report Generation; List of individuals/roles authorized to generate audit reports | MISSING; MISSING | Missing |
| CM.L2-3.4.3 | Change control | Configuration Management Policy; Procedures for Configuration Management; Records of configuration change control activities | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-CMP-001_Configuration_Management_Plan.md; compliance/cmmc/level2/05-evidence/ | Met |
| CM.L2-3.4.5 | Change access restrictions | Procedures for Access Restrictions for Changes; Access authorization records for change control | MISSING; compliance/cmmc/level2/04-self-assessment/MAC-AUD-408_System_Control_Traceability_Matrix.md | Missing |
| IA.L2-3.5.3 | MFA for privileged accounts | Procedures for Remote Access; Procedures for Authenticator Management; Identification and Authentication Policy | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md | Met |
| IA.L2-3.5.4 | Replay-resistant authentication | Identification and Authentication Policy; Procedures for User Identification and Authentication | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md | Met |
| IA.L2-3.5.6 | Disable identifiers after inactivity | Definition of the period of inactivity after which an identifier is disabled | MISSING | Missing |
| IA.L2-3.5.9 | Temporary passwords | Procedures for establishing, changing, and revoking authenticators | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md | Met |
| IA.L2-3.5.10 | Cryptographically-protected passwords | Procedures for establishing, changing, and revoking authenticators | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md | Met |
| IA.L2-3.5.11 | Obscure authentication feedback | Policy for authentication feedback (obscure feedback) | MISSING | Missing |
| MA.L2-3.7.1 | Perform maintenance | Maintenance Policy; Procedures for System Maintenance; Maintenance schedules & records of maintenance activities | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-221_Maintenance_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md; compliance/cmmc/level2/05-evidence/ | Met |
| MA.L2-3.7.2 | Controls on maintenance tools | Procedures for Controlled Maintenance; List of authorized maintenance personnel | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-238_Maintenance_Tool_Control_Procedure.md; MISSING | Missing |
| MA.L2-3.7.5 | MFA for nonlocal maintenance | Procedures for Remote Maintenance; Records of remote maintenance sessions | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md; compliance/cmmc/level2/05-evidence/ | Met |
| MP.L2-3.8.1 | Protect system media | Media Protection Policy; Procedures for Media Protection | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md; compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md | Met |
| MP.L2-3.8.2 | Limit access to CUI on media | Procedures for Media Access | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md | Met |
| MP.L2-3.8.5 | Control access during transport | Procedures for Media Control; Records of media accountability (logs, inventories) | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md; compliance/cmmc/level2/05-evidence/ | Met |
| MP.L2-3.8.8 | Prohibit portable storage without owner | Procedures for Media Storage and Transport | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md | Met |
| RA.L2-3.11.2 | Scan for vulnerabilities | Procedures for Vulnerability Management; Records of vulnerability remediation activities | compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-230_Vulnerability_Scanning_Procedure.md; compliance/cmmc/level2/05-evidence/ | Met |
| RA.L2-3.11.3 | Remediate vulnerabilities | Procedures for Malicious Code Protection; Records of malicious code protection updates and scans | compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md; compliance/cmmc/level2/05-evidence/ | Met |
| SC.L2-3.13.2 | Architectural designs | Procedures for Security Engineering Principles; Security architecture documentation | compliance/cmmc/level2/01-system-scope/MAC-IT-301_System_Description_and_Architecture.md; compliance/cmmc/level2/01-system-scope/MAC-IT-306_CUI_Vault_Architecture_Diagram.md | Met |
| SC.L2-3.13.3 | Separate user/system management | Gov docs for separation of duties and system management | MISSING | Missing |
| SC.L2-3.13.4 | Prevent unauthorized information transfer | Gov docs for information transfer controls | MISSING | Missing |
| SC.L2-3.13.5 | Implement subnetworks | Network/security architecture documentation and procedures | MISSING | Missing |
| SC.L2-3.13.9 | Terminate network connections | Procedures for session/connection termination | MISSING | Missing |
| SC.L2-3.13.10 | Cryptographic key management | Procedures for Cryptographic Key Management; Cryptographic key management plan | MISSING; MISSING | Missing |
| SC.L2-3.13.12 | Collaborative computing devices | Gov docs for RDP/collaborative device use and restrictions | MISSING | Missing |
| SC.L2-3.13.13 | Control mobile code | Procedures for mobile code/script control; Procedures for Malicious Code Protection | MISSING; compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md | Missing |
| SC.L2-3.13.15 | Protect authenticity of communications | Procedures for transmission integrity (SMB signing/crypto) | MISSING | Missing |
| SI.L2-3.14.3 | Monitor security alerts | Procedures for System Monitoring; Security alert monitoring and response records | MISSING; MISSING | Missing |
| SI.L2-3.14.7 | Identify unauthorized use | Procedures for System Monitoring; Records of actions taken in response to monitoring | MISSING; compliance/cmmc/level2/05-evidence/ | Missing |

---

## Gap summary: missing artifact labels

The following artifact labels have no mapped document (or path is empty). Add or link documents for these to close the associated controls.

| Artifact label | Required by control(s) |
|----------------|------------------------|
| Cryptographic key management plan | SC.L2-3.13.10 |
| Definition of the period of inactivity after which an identifier is disabled | IA.L2-3.5.6 |
| Gov docs for information transfer controls | SC.L2-3.13.4 |
| Gov docs for RDP/collaborative device use and restrictions | SC.L2-3.13.12 |
| Gov docs for separation of duties and system management | SC.L2-3.13.3 |
| Incident response training materials and records | 3.6.2 |
| Insider Threat Policy & Procedures | 3.2.3 |
| Insider Threat Training Materials | 3.2.3 |
| List of authorized maintenance personnel | MA.L2-3.7.2 |
| List of individuals with authorized access to audit records | AU.L2-3.3.5 |
| List of individuals/roles authorized to generate audit reports | AU.L2-3.3.6 |
| List of personnel with assigned security roles | 3.2.2 |
| Network/security architecture documentation and procedures | SC.L2-3.13.5 |
| POA&M Document | 3.12.2 |
| Policy for authentication feedback (obscure feedback) | IA.L2-3.5.11 |
| Procedures for Access Restrictions for Changes | CM.L2-3.4.5 |
| Procedures for Audit Record Protection | AU.L2-3.3.5 |
| Procedures for Continuous Monitoring | 3.12.3 |
| Procedures for Cryptographic Key Management | SC.L2-3.13.10 |
| Procedures for Limiting Audit Report Generation | AU.L2-3.3.6 |
| Procedures for mobile code/script control | SC.L2-3.13.13 |
| Procedures for Role-Based Security Training | 3.2.2 |
| Procedures for session/connection termination | SC.L2-3.13.9 |
| Procedures for System Monitoring | SI.L2-3.14.3, SI.L2-3.14.7 |
| Procedures for transmission integrity (SMB signing/crypto) | SC.L2-3.13.15 |
| Role-Based Training Curriculum & Materials | 3.2.2 |
| Security alert monitoring and response records | SI.L2-3.14.3 |
| Security Awareness Training Curriculum & Materials | 3.2.1 |
| Training records demonstrating insider threat awareness training | 3.2.3 |
| Training records for all personnel with security responsibilities | 3.2.2 |
| Training records for all users, managers, and administrators | 3.2.1 |

---

## Regenerating this report

Run from the control-plane directory:

```bash
npm run governance-inventory
```

Update `docs/governance-inventory/artifact-label-to-document-mapping.json` to map new or changed artifact labels to mactech paths.
