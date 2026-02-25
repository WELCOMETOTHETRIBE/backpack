# CMMC 2.0 Level 2 - C3PAO Demand Sheet

## Introduction

This document provides a comprehensive demand sheet for Certified Third-Party Assessment Organizations (C3PAOs) to conduct a CMMC 2.0 Level 2 assessment. It is structured around the 14 domains and 110 practices of NIST SP 800-171 Rev 2, which forms the basis for CMMC Level 2.

For each practice, this demand sheet outlines the evidence to be collected through the three assessment methods as defined in NIST SP 800-171A: **Interview**, **Examine**, and **Test**. The goal is to ensure a thorough and consistent assessment process, leading to a high-confidence determination of the organization's cybersecurity posture.

**Note to the Assessor**: This demand sheet is a guide. The specific evidence requested and tests performed may vary based on the organization's environment, scope, and the professional judgment of the C3PAO. The ultimate goal is to gather sufficient evidence to make a confident determination for each practice.

## General Documentation and Evidence Requirements

Before diving into individual domains, the following high-level documentation should be requested from the Organization Seeking Certification (OSC):

- **System Security Plan (SSP)**: The primary document describing the system boundary, how security requirements are met, and any planned implementations.
- **Plan of Action and Milestones (POA&M)**: A document that tracks and manages the remediation of identified security weaknesses.
- **Network and Data Flow Diagrams**: Visual representations of the network architecture and how Controlled Unclassified Information (CUI) flows through the system.
- **Asset Inventory**: A comprehensive list of all hardware and software assets within the CMMC scope.
- **Information Security Policies and Procedures**: The complete set of organizational policies and procedures governing information security.
- **Risk Assessment Report**: The most recent risk assessment, including identified risks and mitigation strategies.
- **Incident Response Plan**: The plan for responding to security incidents.
- **Configuration Management Plan**: The plan for managing and controlling system configurations.
- **Security Awareness and Training Records**: Evidence of security training for all personnel.
- **Previous Assessment Reports**: Any previous self-assessments or third-party assessments.


## Domain 1: Access Control (AC)

### AC.L2-3.1.1: Limit information system access to authorized users, processes acting on behalf of authorized users, or devices (including other information systems).

*   **Interview**:
    *   Interview system administrators to understand how user access is provisioned, managed, and de-provisioned.
    *   Interview a sample of users to confirm they only have access to the resources necessary for their roles.
*   **Examine**:
    *   Examine access control policies and procedures.
    *   Examine user account creation and modification records.
    *   Examine system audit logs for unauthorized access attempts.
*   **Test**:
    *   Attempt to access resources with an unauthorized account.
    *   Attempt to escalate privileges with a standard user account.

### AC.L2-3.1.2: Limit information system access to the types of transactions and functions that authorized users are permitted to execute.

*   **Interview**:
    *   Interview system administrators to understand how access to transactions and functions is managed based on roles and responsibilities.
*   **Examine**:
    *   Examine access control policies and procedures that define authorized transactions for different user roles.
    *   Examine system configurations that enforce role-based access control (RBAC).
*   **Test**:
    *   Attempt to perform a function or transaction not authorized for a specific user role.

### AC.L2-3.1.3: Control the flow of CUI in accordance with approved authorizations.

*   **Interview**:
    *   Interview system administrators and data owners to understand how CUI flow is controlled and monitored.
*   **Examine**:
    *   Examine data flow diagrams for CUI.
    *   Examine firewall and router configurations that control data flow.
    *   Examine Data Loss Prevention (DLP) tool configurations and logs.
*   **Test**:
    *   Attempt to exfiltrate CUI to an unauthorized location.

... (and so on for all 110 practices)

### AC.L2-3.1.4: Separate the duties of individuals to reduce the risk of malevolent activity without collusion.

*   **Interview**:
    *   Interview managers and system owners to understand how separation of duties is implemented for critical functions.
*   **Examine**:
    *   Examine policies and procedures defining roles and responsibilities to ensure separation of duties.
    *   Examine system configurations that enforce separation of duties.
*   **Test**:
    *   Attempt to perform conflicting duties with a single user account.

### AC.L2-3.1.5: Employ the principle of least privilege, including for specific security functions and privileged accounts.

*   **Interview**:
    *   Interview system administrators to understand how the principle of least privilege is enforced for user and privileged accounts.
*   **Examine**:
    *   Examine access control policies and procedures.
    *   Examine user and privileged account configurations to verify that only necessary privileges are granted.
*   **Test**:
    *   Attempt to access resources or perform functions beyond the defined privileges of a user account.

### AC.L2-3.1.6: Use non-privileged accounts or roles when accessing nonsecurity functions.

*   **Interview**:
    *   Interview privileged users to confirm they use non-privileged accounts for daily tasks.
*   **Examine**:
    *   Examine audit logs to verify that privileged accounts are only used for security functions.
*   **Test**:
    *   Observe a privileged user performing daily tasks to ensure they are using a non-privileged account.

### AC.L2-3.1.7: Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.

*   **Interview**:
    *   Interview system administrators to understand how non-privileged users are prevented from executing privileged functions.
*   **Examine**:
    *   Examine system configurations that restrict access to privileged functions.
    *   Examine audit logs to verify that the execution of privileged functions is captured.
*   **Test**:
    *   Attempt to execute a privileged function with a non-privileged account.

### AC.L2-3.1.8: Limit unsuccessful logon attempts.

*   **Interview**:
    *   Interview system administrators to understand the policy on unsuccessful logon attempts.
*   **Examine**:
    *   Examine account lockout policies and configurations.
*   **Test**:
    *   Attempt to log on with incorrect credentials multiple times to trigger the account lockout mechanism.

### AC.L2-3.1.9: Provide privacy and security notices consistent with applicable CUI rules.

*   **Interview**:
    *   Interview system administrators to understand how privacy and security notices are displayed to users.
*   **Examine**:
    *   Examine the content of privacy and security notices.
*   **Test**:
    *   Log on to the system to verify that the privacy and security notice is displayed.

### AC.L2-3.1.11: Terminate a user session after a defined condition.

*   **Interview**:
    *   Interview system administrators to understand the session termination policy.
*   **Examine**:
    *   Examine system configurations for session timeout.
*   **Test**:
    *   Leave a session idle to verify that it terminates after the defined period.

### AC.L2-3.1.12: Control and monitor remote access sessions.

*   **Interview**:
    *   Interview system administrators to understand how remote access is controlled and monitored.
*   **Examine**:
    *   Examine remote access policies and procedures.
    *   Examine remote access logs.
*   **Test**:
    *   Initiate a remote access session and verify that it is logged and monitored.

### AC.L2-3.1.13: Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.

*   **Interview**:
    *   Interview system administrators to understand how remote access sessions are encrypted.
*   **Examine**:
    *   Examine VPN or other remote access solution configurations.
*   **Test**:
    *   Use a network sniffer to verify that remote access traffic is encrypted.

### AC.L2-3.1.14: Route remote access via managed access control points.

*   **Interview**:
    *   Interview network administrators to understand how remote access traffic is routed.
*   **Examine**:
    *   Examine network diagrams and firewall configurations.
*   **Test**:
    *   Attempt to establish a remote access session that bypasses the managed access control point.

### AC.L2-3.1.15: Authorize remote execution of privileged commands and remote access to security-relevant information.

*   **Interview**:
    *   Interview system administrators to understand the process for authorizing remote privileged access.
*   **Examine**:
    *   Examine remote access policies and procedures for privileged access.
    *   Examine records of authorized remote privileged access.
*   **Test**:
    *   Attempt to execute a privileged command remotely without authorization.

### AC.L2-3.1.16: Authorize and control wireless access to the information system.

*   **Interview**:
    *   Interview network administrators to understand how wireless access is authorized and controlled.
*   **Examine**:
    *   Examine wireless access policies and procedures.
    *   Examine wireless access point configurations.
*   **Test**:
    *   Attempt to connect to the wireless network with an unauthorized device.

### AC.L2-3.1.17: Protect wireless access using authentication and encryption.

*   **Interview**:
    *   Interview network administrators to understand how wireless access is protected.
*   **Examine**:
    *   Examine wireless access point configurations for authentication and encryption settings (e.g., WPA2/3).
*   **Test**:
    *   Use a wireless network analyzer to verify that wireless traffic is encrypted.

### AC.L2-3.1.18: Control the connection of mobile devices.

*   **Interview**:
    *   Interview system administrators to understand the policy on connecting mobile devices.
*   **Examine**:
    *   Examine mobile device management (MDM) policies and configurations.
*   **Test**:
    *   Attempt to connect an unauthorized mobile device to the network.

### AC.L2-3.1.19: Encrypt CUI on mobile devices and mobile computing platforms.

*   **Interview**:
    *   Interview system administrators to understand how CUI is encrypted on mobile devices.
*   **Examine**:
    *   Examine MDM policies and configurations that enforce encryption on mobile devices.
*   **Test**:
    *   Verify that a mobile device containing CUI is encrypted.

### AC.L2-3.1.20: Verify and control/limit connections to and use of external information systems.

*   **Interview**:
    *   Interview system administrators to understand the policy on connecting to external information systems.
*   **Examine**:
    *   Examine firewall and proxy configurations that control connections to external systems.
*   **Test**:
    *   Attempt to connect to an unauthorized external information system.

### AC.L2-3.1.21: Limit use of portable storage devices on external information systems.

*   **Interview**:
    *   Interview system administrators to understand the policy on using portable storage devices on external systems.
*   **Examine**:
    *   Examine policies and technical controls that restrict the use of portable storage devices.
*   **Test**:
    *   Attempt to use a portable storage device on an external system in a way that violates policy.

### AC.L2-3.1.22: Control CUI posted or processed on publicly accessible information systems.

*   **Interview**:
    *   Interview personnel responsible for managing public-facing websites to understand the process for reviewing and approving content.
*   **Examine**:
    *   Examine policies and procedures for posting information on publicly accessible systems.
*   **Test**:
    *   Review publicly accessible systems for any unauthorized CUI.


## Domain 2: Awareness and Training (AT)

### AT.L2-3.2.1: Ensure that managers, systems administrators, and users of organizational information systems are made aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of organizational information systems.

*   **Interview**:
    *   Interview a sample of managers, system administrators, and users to confirm they have received security awareness training and understand the security risks associated with their roles.
*   **Examine**:
    *   Examine security awareness training materials.
    *   Examine training records to verify that all personnel have completed the required training.
*   **Test**:
    *   Conduct a phishing simulation to test user awareness.

### AT.L2-3.2.2: Ensure that personnel are trained to carry out their assigned information security-related duties and responsibilities.

*   **Interview**:
    *   Interview personnel with assigned security roles to confirm they have received the necessary training to perform their duties.
*   **Examine**:
    *   Examine role-based security training materials.
    *   Examine training records to verify that personnel have completed the required role-based training.
*   **Test**:
    *   Observe personnel performing their security-related duties to verify they are following the correct procedures.

### AT.L2-3.2.3: Provide security awareness training on recognizing and reporting potential indicators of insider threat.

*   **Interview**:
    *   Interview personnel to confirm they have received insider threat awareness training and know how to report potential threats.
*   **Examine**:
    *   Examine insider threat awareness training materials.
    *   Examine training records to verify that all personnel have completed the required training.
*   **Test**:
    *   Present a scenario involving a potential insider threat and ask personnel how they would respond.

## Domain 3: Audit and Accountability (AU)

### AU.L2-3.3.1: Create and retain information system audit records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful, unauthorized, or inappropriate information system activity.

*   **Interview**:
    *   Interview system administrators to understand the audit logging policy and how audit records are created and retained.
*   **Examine**:
    *   Examine audit logging policies and procedures.
    *   Examine system configurations to verify that audit logging is enabled for all critical systems and events.
    *   Examine audit logs to verify that they are being created and retained in accordance with policy.
*   **Test**:
    *   Perform an action on the system and verify that it is captured in the audit logs.

### AU.L2-3.3.2: Ensure that the actions of individual information system users can be uniquely traced to those users so they can be held accountable for their actions.

*   **Interview**:
    *   Interview system administrators to understand how user actions are traced.
*   **Examine**:
    *   Examine audit logs to verify that user actions are associated with a unique user ID.
*   **Test**:
    *   Perform an action with a user account and verify that the action is traced to that specific user in the audit logs.


## Domain 4: Configuration Management (CM)

### CM.L2-3.4.1: Establish and maintain baseline configurations and inventories of organizational information systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.

*   **Interview**:
    *   Interview system administrators to understand the process for establishing and maintaining baseline configurations.
*   **Examine**:
    *   Examine configuration management policies and procedures.
    *   Examine baseline configuration documentation.
    *   Examine system inventories.
*   **Test**:
    *   Compare the current configuration of a system to its baseline configuration to identify any unauthorized changes.

### CM.L2-3.4.2: Establish and enforce security configuration settings for information technology products employed in organizational information systems.

*   **Interview**:
    *   Interview system administrators to understand how security configuration settings are enforced.
*   **Examine**:
    *   Examine security configuration checklists (e.g., DISA STIGs, CIS Benchmarks).
    *   Examine system configurations to verify that security settings are enforced.
*   **Test**:
    *   Use a configuration scanning tool to verify that systems are configured in accordance with the organization's security configuration settings.

## Domain 5: Identification and Authentication (IA)

### IA.L2-3.5.1: Identify information system users, processes acting on behalf of users, or devices.

*   **Interview**:
    *   Interview system administrators to understand the process for identifying and managing user accounts.
*   **Examine**:
    *   Examine user account lists.
    *   Examine audit logs to verify that all actions are attributed to a specific user or process.
*   **Test**:
    *   Attempt to access the system without being identified.

### IA.L2-3.5.2: Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.

*   **Interview**:
    *   Interview system administrators to understand the authentication mechanisms used by the organization.
*   **Examine**:
    *   Examine authentication policies and procedures.
    *   Examine system configurations for authentication settings.
*   **Test**:
    *   Attempt to access the system without authenticating.

### IA.L2-3.5.3: Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.

*   **Interview**:
    *   Interview system administrators to understand how multifactor authentication (MFA) is implemented.
*   **Examine**:
    *   Examine MFA policies and configurations.
*   **Test**:
    *   Attempt to access a privileged account or a non-privileged account over the network without using MFA.


## Domain 6: Incident Response (IR)

### IR.L2-3.6.1: Establish an operational incident-handling capability for organizational information systems that includes preparation, detection, analysis, containment, recovery, and user response activities.

*   **Interview**:
    *   Interview the incident response team to understand their roles, responsibilities, and the incident response process.
*   **Examine**:
    *   Examine the incident response plan.
    *   Examine incident response team contact lists and communication procedures.
    *   Examine incident reports from past incidents.
*   **Test**:
    *   Conduct a tabletop exercise to test the incident response plan and the team's response to a simulated incident.

### IR.L2-3.6.2: Track, document, and report incidents to appropriate officials and/or authorities both internal and external to the organization.

*   **Interview**:
    *   Interview the incident response team to understand the incident tracking and reporting process.
*   **Examine**:
    *   Examine incident tracking systems and documentation.
    *   Examine incident reports to verify that they were reported to the appropriate officials.
*   **Test**:
    *   Simulate an incident and verify that it is tracked, documented, and reported in accordance with the incident response plan.

### IR.L2-3.6.3: Test the incident response capability.

*   **Interview**:
    *   Interview the incident response team to understand how the incident response capability is tested.
*   **Examine**:
    *   Examine records of past incident response tests.
*   **Test**:
    *   Observe an incident response test.

## Domain 7: Maintenance (MA)

### MA.L2-3.7.1: Perform maintenance on organizational information systems.

*   **Interview**:
    *   Interview system administrators to understand the system maintenance process.
*   **Examine**:
    *   Examine system maintenance policies and procedures.
    *   Examine maintenance records.
*   **Test**:
    *   Observe system maintenance being performed.

### MA.L2-3.7.2: Provide effective controls on the tools, techniques, mechanisms, and personnel used to conduct information system maintenance.

*   **Interview**:
    *   Interview system administrators to understand how maintenance tools and personnel are controlled.
*   **Examine**:
    *   Examine policies and procedures for controlling maintenance tools and personnel.
    *   Examine access control lists for maintenance accounts.
*   **Test**:
    *   Attempt to perform maintenance with an unauthorized account or tool.


## Domain 8: Media Protection (MP)

### MP.L2-3.8.1: Protect (i.e., physically control and securely store) information system media containing CUI, both paper and digital.

*   **Interview**:
    *   Interview personnel to understand how they handle and store media containing CUI.
*   **Examine**:
    *   Examine media protection policies and procedures.
    *   Examine logs for media access.
*   **Test**:
    *   Inspect storage locations for CUI media to verify that they are secure.

### MP.L2-3.8.2: Limit access to CUI on information system media to authorized users.

*   **Interview**:
    *   Interview personnel to understand how access to CUI on media is controlled.
*   **Examine**:
    *   Examine access control lists for media containing CUI.
*   **Test**:
    *   Attempt to access CUI on media with an unauthorized account.

### MP.L2-3.8.3: Sanitize or destroy information system media containing CUI before disposal or release for reuse.

*   **Interview**:
    *   Interview personnel to understand the media sanitization and destruction process.
*   **Examine**:
    *   Examine media sanitization and destruction policies and procedures.
    *   Examine records of media sanitization and destruction.
*   **Test**:
    *   Observe media sanitization or destruction being performed.

## Domain 9: Personnel Security (PS)

### PS.L2-3.9.1: Screen individuals prior to authorizing access to information systems containing CUI.

*   **Interview**:
    *   Interview HR personnel to understand the personnel screening process.
*   **Examine**:
    *   Examine personnel security policies and procedures.
    *   Examine personnel screening records.
*   **Test**:
    *   Review the screening records for a sample of new hires.

### PS.L2-3.9.2: Ensure that information systems containing CUI are protected during and after personnel actions such as terminations and transfers.

*   **Interview**:
    *   Interview HR personnel and system administrators to understand the process for handling personnel actions.
*   **Examine**:
    *   Examine policies and procedures for personnel actions.
    *   Examine records of account termination or transfer for former employees.
*   **Test**:
    *   Attempt to access the system with the account of a terminated employee.


## Domain 10: Physical Protection (PE)

### PE.L2-3.10.1: Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.

*   **Interview**:
    *   Interview facilities and security personnel to understand how physical access is controlled.
*   **Examine**:
    *   Examine physical access control policies and procedures.
    *   Examine physical access logs.
*   **Test**:
    *   Attempt to enter a secure area without authorization.

### PE.L2-3.10.2: Protect and monitor the physical facility and support infrastructure for organizational information systems.

*   **Interview**:
    *   Interview facilities and security personnel to understand how the facility is protected and monitored.
*   **Examine**:
    *   Examine records from physical security systems (e.g., video surveillance, intrusion detection systems).
*   **Test**:
    *   Inspect the physical security of the facility.

## Domain 11: Risk Assessment (RA)

### RA.L2-3.11.1: Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational information systems and the associated processing, storage, or transmission of CUI.

*   **Interview**:
    *   Interview personnel responsible for risk management to understand the risk assessment process.
*   **Examine**:
    *   Examine risk assessment policies and procedures.
    *   Examine the most recent risk assessment report.
*   **Test**:
    *   Review the risk assessment report to verify that it is complete and accurate.

### RA.L2-3.11.2: Scan for vulnerabilities in the information system and applications periodically and when new vulnerabilities affecting the system are identified.

*   **Interview**:
    *   Interview system administrators to understand the vulnerability scanning process.
*   **Examine**:
    *   Examine vulnerability management policies and procedures.
    *   Examine vulnerability scan reports.
*   **Test**:
    *   Perform a vulnerability scan on a sample of systems.

### RA.L2-3.11.3: Remediate vulnerabilities in accordance with risk assessments.

*   **Interview**:
    *   Interview system administrators to understand the vulnerability remediation process.
*   **Examine**:
    *   Examine vulnerability remediation policies and procedures.
    *   Examine records of vulnerability remediation.
*   **Test**:
    *   Verify that a sample of identified vulnerabilities have been remediated.


## Domain 12: Security Assessment (CA)

### CA.L2-3.12.1: Periodically assess the security controls in organizational information systems to determine if the controls are effective in their application.

*   **Interview**:
    *   Interview personnel responsible for security assessment to understand the assessment process.
*   **Examine**:
    *   Examine security assessment policies and procedures.
    *   Examine the most recent security assessment report.
*   **Test**:
    *   Review the security assessment report to verify that it is complete and accurate.

### CA.L2-3.12.2: Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational information systems.

*   **Interview**:
    *   Interview personnel responsible for creating and managing POA&Ms.
*   **Examine**:
    *   Examine the POA&M.
*   **Test**:
    *   Verify that a sample of items on the POA&M have been completed.

### CA.L2-3.12.3: Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.

*   **Interview**:
    *   Interview personnel responsible for continuous monitoring.
*   **Examine**:
    *   Examine continuous monitoring policies and procedures.
    *   Examine reports from continuous monitoring tools.
*   **Test**:
    *   Observe the continuous monitoring process.

### CA.L2-3.12.4: Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.

*   **Interview**:
    *   Interview the personnel responsible for maintaining the SSP.
*   **Examine**:
    *   Examine the SSP.
*   **Test**:
    *   Compare the SSP to the actual system implementation to verify that it is accurate and complete.

## Domain 13: System and Communications Protection (SC)

### SC.L2-3.13.1: Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems.

*   **Interview**:
    *   Interview network administrators to understand how communications are monitored, controlled, and protected.
*   **Examine**:
    *   Examine network diagrams, firewall rules, and IDS/IPS configurations.
*   **Test**:
    *   Attempt to bypass boundary protections.

### SC.L2-3.13.5: Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.

*   **Interview**:
    *   Interview network administrators to understand the network architecture and the use of DMZs.
*   **Examine**:
    *   Examine network diagrams and firewall rules.
*   **Test**:
    *   Verify that publicly accessible systems are in a separate subnetwork.

### SC.L2-3.13.11: Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.

*   **Interview**:
    *   Interview system administrators to understand how cryptography is used to protect CUI.
*   **Examine**:
    *   Examine system configurations to verify that FIPS-validated cryptography is used.
*   **Test**:
    *   Verify that a sample of CUI is encrypted using FIPS-validated cryptography.

## Domain 14: System and Information Integrity (SI)

### SI.L2-3.14.1: Identify, report, and correct information and information system flaws in a timely manner.

*   **Interview**:
    *   Interview system administrators to understand the flaw remediation process.
*   **Examine**:
    *   Examine flaw remediation policies and procedures.
    *   Examine records of flaw remediation.
*   **Test**:
    *   Verify that a sample of identified flaws have been remediated.

### SI.L2-3.14.2: Provide protection from malicious code at appropriate locations within organizational information systems.

*   **Interview**:
    *   Interview system administrators to understand how the organization protects against malicious code.
*   **Examine**:
    *   Examine anti-malware policies and procedures.
    *   Examine anti-malware solution configurations.
*   **Test**:
    *   Attempt to introduce a safe virus sample to test the anti-malware solution.

### SI.L2-3.14.4: Update malicious code protection mechanisms when new releases are available.

*   **Interview**:
    *   Interview system administrators to understand the process for updating malicious code protection mechanisms.
*   **Examine**:
    *   Examine records of malicious code protection updates.
*   **Test**:
    *   Verify that malicious code protection mechanisms are up to date.

### SI.L2-3.14.5: Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.

*   **Interview**:
    *   Interview system administrators to understand the scanning process.
*   **Examine**:
    *   Examine scanning policies and procedures.
    *   Examine scan reports.
*   **Test**:
    *   Download a safe test file and verify that it is scanned.


## Conclusion and Final Reporting

Upon completion of the assessment activities for all 110 practices across the 14 domains, the C3PAO must compile all findings into a final assessment report. This report will serve as the basis for the CMMC Level 2 certification decision.

The report should clearly articulate the evidence collected for each practice, the results of all tests, and a determination of whether each practice is met, not met, or not applicable. Any identified deficiencies must be documented in the POA&M, and the OSC must have a plan in place to address them.

By systematically working through this demand sheet, C3PAOs can ensure a consistent, thorough, and evidence-based assessment that provides a high degree of confidence in the OSC's cybersecurity posture and their ability to protect CUI.
