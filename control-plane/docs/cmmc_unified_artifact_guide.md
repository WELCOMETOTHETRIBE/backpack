# CMMC Unified Artifact & Handling Guide (Azure Commercial)

---

## 1. Introduction: The Assessor's View

This document provides a single, unified reference for CMMC Level 2 compliance, designed from the perspective of a C3PAO assessor. It maps every governance artifact required for the 110 NIST SP 800-171 Rev 2 controls and provides two critical classifications for each:

1.  **Satisfaction Type:** This classification, based on the official NIST SP 800-171A assessment procedures, identifies how a control is primarily satisfied.
    *   **Governance-Centric:** The primary evidence is a policy, procedure, plan, or record. The control cannot be satisfied without this documentation.
    *   **Technical-Centric:** The primary evidence is a system configuration, log file, or tool output. The assessor's focus is on the technical implementation.
    *   **Hybrid:** Requires a near-equal blend of both governance and technical evidence. The policy defines the rule, and the system configuration enforces it.

2.  **Artifact Handling:** This classification dictates how each artifact should be handled within the CMMC OS platform when hosted on a commercial cloud (e.g., Azure Commercial), ensuring the platform itself does not become a compliance liability.
    *   **UPLOAD:** Safe to store directly in the platform. These are typically policy statements, procedures, and records that do not contain sensitive system-specific details.
    *   **REFERENCE:** Sensitive operational documents. The platform stores only a metadata pointer (name, version, location, hash), while the document remains securely within your CUI enclave.
    *   **NATIVE:** Artifacts that are generated and managed directly within the platform (e.g., the POA&M).
    *   **N/A (Not Applicable):** For purely technical controls where the evidence is a system state, not a document.

This unified guide is the master checklist for building your compliance program and preparing for your CMMC assessment.

---

## 2. Unified Artifact & Handling Guide

### 3.1 Access Control (AC)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.1.1** | Hybrid | Access Control Policy | **UPLOAD** |
| | | Procedures for Account Management | **UPLOAD** |
| | | System Security Plan (SSP) | **REFERENCE** |
| | | List of active system accounts & associated individuals | **REFERENCE** |
| | | Records of transferred/terminated employees | **REFERENCE** |
| | | Access authorization records | **REFERENCE** |
| **3.1.2** | Hybrid | Access Control Policy | **UPLOAD** |
| | | Procedures for Access Enforcement | **UPLOAD** |
| | | List of approved user privileges/authorizations | **REFERENCE** |
| **3.1.3** | Hybrid | Information Flow Control Policy | **UPLOAD** |
| | | Procedures for Information Flow Enforcement | **UPLOAD** |
| | | List of information flow authorizations | **REFERENCE** |
| **3.1.4** | Governance-Centric | Access Control Policy | **UPLOAD** |
| | | Procedures for Separation of Duties | **UPLOAD** |
| | | List of defined roles and responsibilities requiring separation | **UPLOAD** |
| **3.1.5** | Hybrid | Procedures for Least Privilege | **UPLOAD** |
| | | List of privileged accounts and associated individuals | **REFERENCE** |
| **3.1.6** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.7** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.8** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.9** | Governance-Centric | System Use Notification / Warning Banner Text | **UPLOAD** |
| | | Legal review and approval records for banner content | **UPLOAD** |
| **3.1.10** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.11** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.12** | Hybrid | Procedures for Remote Access | **UPLOAD** |
| | | Configuration Management Plan | **REFERENCE** |
| | | Remote access authorizations | **REFERENCE** |
| **3.1.13** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.14** | Technical-Centric | System design documentation | **REFERENCE** |
| **3.1.15** | Governance-Centric | List of authorized privileged commands for remote execution | **REFERENCE** |
| | | List of authorized security-relevant information for remote access | **REFERENCE** |
| **3.1.16** | Governance-Centric | Procedures for Wireless Access | **UPLOAD** |
| | | Wireless access authorizations | **REFERENCE** |
| **3.1.17** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.18** | Hybrid | Procedures for Mobile Device Access | **UPLOAD** |
| | | Authorizations for mobile device connections | **REFERENCE** |
| **3.1.19** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.20** | Governance-Centric | Procedures for Publicly Accessible Content | **UPLOAD** |
| | | List of users authorized to post public content | **UPLOAD** |
| | | Records of public information reviews | **UPLOAD** |
| **3.1.21** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.1.22** | Governance-Centric | Procedures for CUI Handling | **UPLOAD** |
"""

### 3.2 Awareness and Training (AT)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.2.1** | Governance-Centric | Security Awareness and Training Policy | **UPLOAD** |
| | | Procedures for Security Awareness Training | **UPLOAD** |
| | | Security Awareness Training Curriculum & Materials | **UPLOAD** |
| | | Training records for all users, managers, and administrators | **UPLOAD** |
| **3.2.2** | Governance-Centric | Procedures for Role-Based Security Training | **UPLOAD** |
| | | Role-Based Training Curriculum & Materials | **UPLOAD** |
| | | List of personnel with assigned security roles | **UPLOAD** |
| | | Training records for all personnel with security responsibilities | **UPLOAD** |
| **3.2.3** | Governance-Centric | Insider Threat Policy & Procedures | **UPLOAD** |
| | | Insider Threat Training Materials | **UPLOAD** |
| | | Training records demonstrating insider threat awareness training | **UPLOAD** |

### 3.3 Audit and Accountability (AU)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.3.1** | Hybrid | Audit and Accountability Policy | **UPLOAD** |
| | | Procedures for Auditable Events | **UPLOAD** |
| | | List of defined auditable events | **UPLOAD** |
| | | Definition of audit record content & retention requirements | **UPLOAD** |
| **3.3.2** | Governance-Centric | Procedures for Audit Review, Analysis, and Reporting | **UPLOAD** |
| | | Records of audit log reviews, analysis, and reporting | **REFERENCE** |
| | | Records of actions taken in response to audit reviews | **REFERENCE** |
| **3.3.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.3.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.3.5** | Hybrid | Procedures for Audit Record Protection | **UPLOAD** |
| | | List of individuals with authorized access to audit records | **UPLOAD** |
| **3.3.6** | Governance-Centric | Procedures for Limiting Audit Report Generation | **UPLOAD** |
| | | List of individuals/roles authorized to generate audit reports | **UPLOAD** |
| **3.3.7** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.3.8** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.3.9** | Governance-Centric | Procedures for Session Audit | **UPLOAD** |
| | | List of privileged accounts to be audited | **UPLOAD** |

### 3.4 Configuration Management (CM)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.4.1** | Governance-Centric | Configuration Management Policy | **UPLOAD** |
| | | Procedures for Configuration Management | **UPLOAD** |
| | | System Baseline Configuration Document | **REFERENCE** |
| **3.4.2** | Governance-Centric | Procedures for Configuration Change Control | **UPLOAD** |
| | | Records of configuration change control activities | **REFERENCE** |
| **3.4.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.4.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.4.5** | Governance-Centric | Procedures for Access Restrictions for Changes | **UPLOAD** |
| | | Access authorization records for change control | **REFERENCE** |
| **3.4.6** | Governance-Centric | Procedures for Least Functionality | **UPLOAD** |
| | | List of authorized software & approval records | **UPLOAD** |
| **3.4.7** | Governance-Centric | List of prohibited or restricted software | **UPLOAD** |
| **3.4.8** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.4.9** | Technical-Centric | N/A (Technical implementation) | **N/A** |

### 3.5 Identification and Authentication (IA)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.5.1** | Hybrid | Identification and Authentication Policy | **UPLOAD** |
| | | Procedures for User Identification and Authentication | **UPLOAD** |
| **3.5.2** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.5.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.5.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.5.5** | Governance-Centric | Procedures for Identifier Management | **UPLOAD** |
| | | Definition of the period for which identifiers cannot be reused | **UPLOAD** |
| **3.5.6** | Governance-Centric | Definition of the period of inactivity after which an identifier is disabled | **UPLOAD** |
| **3.5.7** | Governance-Centric | Procedures for Authenticator Management | **UPLOAD** |
| | | Definition of authenticator strength requirements | **UPLOAD** |
| **3.5.8** | Governance-Centric | Definition of password complexity, change frequency, and reuse rules | **UPLOAD** |
| **3.5.9** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.5.10** | Governance-Centric | Procedures for establishing, changing, and revoking authenticators | **UPLOAD** |
| **3.5.11** | Technical-Centric | N/A (Technical implementation) | **N/A** |

### 3.6 Incident Response (IR)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.6.1** | Governance-Centric | Incident Response Policy | **UPLOAD** |
| | | Incident Response Plan | **REFERENCE** |
| | | Procedures for Incident Handling | **REFERENCE** |
| **3.6.2** | Governance-Centric | Procedures for Incident Reporting | **UPLOAD** |
| | | Incident response training materials and records | **UPLOAD** |
| **3.6.3** | Governance-Centric | Procedures for Incident Response Testing | **UPLOAD** |
| | | Incident response test plans and results | **REFERENCE** |

### 3.7 Maintenance (MA)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.7.1** | Governance-Centric | Maintenance Policy | **UPLOAD** |
| | | Procedures for System Maintenance | **UPLOAD** |
| | | Maintenance schedules & records of maintenance activities | **REFERENCE** |
| **3.7.2** | Governance-Centric | Procedures for Controlled Maintenance | **UPLOAD** |
| | | List of authorized maintenance personnel | **UPLOAD** |
| **3.7.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.7.4** | Governance-Centric | Procedures for Maintenance Tool Management | **UPLOAD** |
| | | List of approved maintenance tools | **UPLOAD** |
| **3.7.5** | Governance-Centric | Procedures for Remote Maintenance | **UPLOAD** |
| | | Records of remote maintenance sessions | **REFERENCE** |
| **3.7.6** | Governance-Centric | Procedures for Media Sanitization | **UPLOAD** |
| | | Records of media sanitization | **REFERENCE** |

### 3.8 Media Protection (MP)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.8.1** | Governance-Centric | Media Protection Policy | **UPLOAD** |
| | | Procedures for Media Protection | **UPLOAD** |
| **3.8.2** | Governance-Centric | Procedures for Media Access | **UPLOAD** |
| **3.8.3** | Governance-Centric | Procedures for Media Sanitization & Disposal | **UPLOAD** |
| | | Records of media sanitization and disposal | **REFERENCE** |
| **3.8.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.8.5** | Governance-Centric | Procedures for Media Control | **UPLOAD** |
| | | Records of media accountability (logs, inventories) | **REFERENCE** |
| **3.8.6** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.8.7** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.8.8** | Governance-Centric | Procedures for Media Storage and Transport | **UPLOAD** |
| **3.8.9** | Technical-Centric | N/A (Technical implementation) | **N/A** |

### 3.9 Personnel Security (PS)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.9.1** | Governance-Centric | Personnel Security Policy | **UPLOAD** |
| | | Procedures for Personnel Screening | **UPLOAD** |
| | | Records of personnel screening | **REFERENCE** |
| **3.9.2** | Governance-Centric | Procedures for Personnel Termination and Transfer | **UPLOAD** |
| | | Records of actions taken upon personnel termination or transfer | **REFERENCE** |

### 3.10 Physical Protection (PE)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.10.1** | Governance-Centric | Physical and Environmental Protection Policy | **UPLOAD** |
| | | Procedures for Physical Access Authorizations | **UPLOAD** |
| | | Authorized personnel access list | **UPLOAD** |
| **3.10.2** | Hybrid | Procedures for Physical Access Monitoring | **UPLOAD** |
| | | Physical access logs & monitoring records | **REFERENCE** |
| **3.10.3** | Governance-Centric | Procedures for Visitor Control | **UPLOAD** |
| | | Visitor access logs | **UPLOAD** |
| **3.10.4** | Governance-Centric | Procedures for Physical Access Control | **UPLOAD** |
| | | Inventory records of physical access devices | **UPLOAD** |
| **3.10.5** | Governance-Centric | Procedures for CUI Asset Control | **UPLOAD** |
| | | Records of CUI asset inventories | **REFERENCE** |
| **3.10.6** | Technical-Centric | N/A (Technical implementation) | **N/A** |

### 3.11 Risk Assessment (RA)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.11.1** | Governance-Centric | Risk Assessment Policy | **UPLOAD** |
| | | Procedures for Risk Assessment | **UPLOAD** |
| | | Risk assessment reports | **REFERENCE** |
| | | Records of vulnerability scans | **REFERENCE** |
| **3.11.2** | Governance-Centric | Procedures for Vulnerability Management | **UPLOAD** |
| | | Records of vulnerability remediation activities | **REFERENCE** |
| **3.11.3** | Governance-Centric | Procedures for Malicious Code Protection | **UPLOAD** |
| | | Records of malicious code protection updates and scans | **REFERENCE** |

### 3.12 Security Assessment (CA)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.12.1** | Governance-Centric | Security Assessment and Authorization Policy | **UPLOAD** |
| | | Procedures for Security Assessments | **UPLOAD** |
| | | Security assessment plans | **REFERENCE** |
| | | Security assessment reports | **REFERENCE** |
| **3.12.2** | Governance-Centric | Procedures for Plan of Action and Milestones (POA&M) | **UPLOAD** |
| | | POA&M Document | **NATIVE** |
| **3.12.3** | Governance-Centric | Procedures for Continuous Monitoring | **UPLOAD** |
| | | Continuous monitoring plan | **REFERENCE** |
| | | Records of continuous monitoring activities | **REFERENCE** |
| **3.12.4** | Governance-Centric | Security Planning Policy | **UPLOAD** |
| | | Procedures for System Security Plan Development and Review | **UPLOAD** |
| | | Records of SSP reviews and updates | **REFERENCE** |

### 3.13 System and Communications Protection (SC)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.13.1** | Hybrid | System and Communications Protection Policy | **UPLOAD** |
| | | Procedures for Boundary Protection | **UPLOAD** |
| | | System design & enterprise security architecture documentation | **REFERENCE** |
| **3.13.2** | Governance-Centric | Procedures for Security Engineering Principles | **UPLOAD** |
| | | Security architecture documentation | **REFERENCE** |
| **3.13.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.5** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.6** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.7** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.8** | Hybrid | Procedures for Transmission Confidentiality | **UPLOAD** |
| | | List of alternative physical safeguards | **UPLOAD** |
| **3.13.9** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.10** | Governance-Centric | Procedures for Cryptographic Key Management | **UPLOAD** |
| | | Cryptographic key management plan | **REFERENCE** |
| **3.13.11** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.12** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.13** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.14** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.15** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.13.16** | Technical-Centric | N/A (Technical implementation) | **N/A** |

### 3.14 System and Information Integrity (SI)

| Control ID | Satisfaction Type | Artifact | Handling |
| :--- | :--- | :--- | :--- |
| **3.14.1** | Governance-Centric | System and Information Integrity Policy | **UPLOAD** |
| | | Procedures for Flaw Remediation | **UPLOAD** |
| | | Records of flaw remediation activities | **REFERENCE** |
| **3.14.2** | Governance-Centric | Procedures for Malicious Code Protection | **UPLOAD** |
| | | Records of malicious code protection activities | **REFERENCE** |
| **3.14.3** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.14.4** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.14.5** | Technical-Centric | N/A (Technical implementation) | **N/A** |
| **3.14.6** | Hybrid | Procedures for System Monitoring | **UPLOAD** |
| | | System monitoring records | **REFERENCE** |
| | | Records of actions taken in response to monitoring | **REFERENCE** |
| **3.14.7** | Technical-Centric | N/A (Technical implementation) | **N/A** |
