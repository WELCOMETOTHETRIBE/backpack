# Ongoing Stakeholder Requirements - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This document consolidates all ongoing compliance requirements for stakeholders (users and administrators) of the MacTech Solutions system. These requirements ensure continued compliance with CMMC Level 2 controls and NIST SP 800-171 Rev. 2 throughout the system lifecycle.

This document serves as a single reference point for ongoing responsibilities that stakeholders must fulfill after initial system access is granted.

---

## 2. Scope

This document applies to:

- All users with system access (USER and ADMIN roles)
- All administrators managing the system
- All personnel who access Federal Contract Information (FCI) or Controlled Unclassified Information (CUI) through the system
- All personnel with physical access to locations where systems used to process/store/access FCI or CUI exist

**System Scope:** FCI and CUI environment. Both FCI and CUI are processed, stored, and transmitted in accordance with CMMC Level 2 requirements.

---

## 3. Password Management Requirements

### 3.1 Password Change Requirements

**Current Status:** Password expiration policies are not currently enforced by the system. However, stakeholders are expected to:

- Change passwords if they suspect compromise
- Use strong passwords (minimum 14 characters with complexity requirements enforced)
- Not reuse passwords across systems
- Not share passwords with anyone

**Future Enhancement:** Password expiration policies may be implemented as a system enhancement.

**Related Policy:** See `MAC-POL-211_Identification_and_Authentication_Policy.md` (Section 5)

### 3.2 Password Security

**Requirements:**
- Do not share account credentials with anyone
- Do not write down passwords in unsecured locations
- Change password immediately if compromise is suspected
- Report suspected password compromise to Security Contact (security@mactechsolutions.com)

**Enforcement:** Procedural requirement; violation may result in access revocation.

---

## 4. Access Review Requirements

### 4.1 Least Privilege Principle

**Requirement:** Access must be limited to the minimum necessary to perform job functions.

**Ongoing Responsibilities:**
- Review your access permissions periodically
- Report if your access exceeds what is needed for your role
- Request access reduction if your role changes and no longer requires current level of access
- Participate in access reviews when requested by administrators

**Review Frequency:** Access reviews may be conducted periodically by administrators. Stakeholders must participate when requested.

**Related Policy:** See `MAC-POL-210_Access_Control_Policy.md` (Section 3.3)

### 4.2 Role Change Notification

**Requirement:** Notify system administrators immediately if your role or job function changes in a way that affects system access needs.

**Notification Triggers:**
- Job function change that eliminates need for system access
- Job function change that requires different access level
- Transfer to different department or project
- Termination of employment

**Notification Method:** Contact system administrator or Security Contact (security@mactechsolutions.com)

**Timeframe:** Within 24 hours of role change

**Related Procedure:** See `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`

---

## 5. Security Awareness and Training Requirements

### 5.1 Initial Training

**Requirement:** Complete initial security awareness training before system access is granted.

**Content:**
- FCI and CUI handling requirements
- CUI protection and password requirements
- Incident reporting procedures
- Password security
- Physical security requirements (if applicable)

**Evidence:** Completion documented via User Access and FCI Handling Acknowledgement form.

### 5.2 Ongoing Awareness

**Requirement:** Maintain awareness of security policies and procedures.

**Responsibilities:**
- Review updated policies and procedures when notified
- Stay informed about security best practices
- Participate in security awareness activities when requested
- Report security concerns or questions to Security Contact

**Review Frequency:** Policies and procedures are reviewed and updated as needed. Stakeholders are notified of significant changes.

---

## 6. Incident Reporting Responsibilities

### 6.1 Security Incident Reporting

**Requirement:** Report security incidents immediately upon discovery.

**Reportable Incidents:**
- Suspected unauthorized access
- Suspected FCI or CUI breach or unauthorized disclosure
- Accidental CUI mishandling or improper classification
- Suspected account compromise
- Malware or suspicious activity
- Physical security incidents
- Any other security concerns

**Reporting Method:** Contact Security Contact immediately:
- **Email:** security@mactechsolutions.com
- **Phone:** ________________________  *(Complete at release.)*

**Timeframe:** Immediately upon discovery (within 1 hour for critical incidents)

**Related Policy:** See `MAC-POL-215_Incident_Response_Policy.md`  
**Related Procedure:** See `MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md`

### 6.2 Incident Response Cooperation

**Requirement:** Cooperate fully with incident response activities.

**Responsibilities:**
- Provide accurate information about incidents
- Preserve evidence as instructed
- Follow incident response procedures
- Maintain confidentiality during investigation

---

## 7. Physical Access Logging Requirements

### 7.1 Applicability

**Requirement:** Personnel with physical access to locations where systems used to process/store/access FCI exist must log physical access entries.

**Who Must Comply:**
- Personnel who access office locations where workstations accessing the system are located
- Personnel who access locations where FCI is processed, stored, or accessed
- Visitors who require escorted access to such locations

**Exemption:** Personnel who do not have physical access to locations where systems used to process/store/access FCI exist are not required to log physical access.

### 7.2 Logging Requirements

**Requirement:** Log all physical access entries using the Physical Access Logs module in the admin portal.

**Required Information:**
- Date and time-in
- Time-out (when leaving)
- Person name
- Purpose of access
- Host/escort name (if applicable)
- Location
- Notes (if applicable)

**Logging Method:** Admin portal at `/admin/physical-access-logs` (ADMIN users) or request logging by administrator

**Frequency:** Each time physical access occurs to applicable locations

**Related Policy:** See `MAC-POL-212_Physical_Security_Policy.md` (Section 4)  
**Related Practice:** PE.L1-3.10.4 - Maintain audit logs of physical access

---

## 8. Endpoint Inventory Maintenance Requirements

### 8.1 Applicability

**Requirement:** Personnel who use endpoints (computers, laptops, tablets, mobile devices) to access or administer the system must maintain endpoint inventory entries.

**Who Must Comply:**
- All users who access the system from any endpoint device
- All administrators who administer the system from any endpoint device

### 8.2 Inventory Requirements

**Requirement:** Ensure all endpoints used to access/administer the system are registered in the Endpoint Inventory module.

**Required Information:**
- Device identifier (hostname, serial number, etc.)
- Owner name
- Operating system
- Antivirus enabled status (yes/no)
- Last verification date
- Verification method

**Update Frequency:**
- Initial registration: When endpoint is first used to access system
- Updates: When endpoint configuration changes (OS update, AV status change, etc.)
- Verification: Antivirus status must be verified periodically (minimum annually)

**Verification Method:** Use Endpoint AV Verification template (`../05-evidence/templates/endpoint-av-verification-template.md`)

**Inventory Method:** Admin portal at `/admin/endpoint-inventory` (ADMIN users) or request registration by administrator

**Related Policy:** See `MAC-POL-214_System_Integrity_Policy.md` (Section 3.3)  
**Related Practice:** SI.L1-3.14.2 - Identify, report, and correct information and information system flaws

---

## 9. Annual Compliance Re-Acknowledgement

### 9.1 Re-Acknowledgement Requirement

**Requirement:** Re-acknowledge compliance with user access and FCI handling requirements annually.

**Frequency:** Annually (within 12 months of previous acknowledgement)

**Process:**
- System administrator or compliance team initiates annual re-acknowledgement
- User reviews updated User Access and FCI Handling Acknowledgement form
- User reviews this Ongoing Stakeholder Requirements document
- User signs updated acknowledgement form
- Acknowledgement is filed and tracked

**Purpose:** Ensure continued awareness of requirements and document ongoing compliance commitment.

### 9.2 Acknowledgement Content

**Re-acknowledgement includes:**
- Review of initial requirements (FCI protection, CUI prohibition, system access, data handling)
- Review of ongoing requirements (this document)
- Confirmation of continued compliance
- Notification of any policy or procedure changes

---

## 10. Change Notification Requirements

### 10.1 Account Information Changes

**Requirement:** Notify system administrators of changes to account information.

**Changes Requiring Notification:**
- Email address change
- Name change
- Role change (job function change affecting access needs)
- Termination of employment
- Transfer to different department/project

**Notification Method:** Contact system administrator or Security Contact

**Timeframe:** Within 24 hours of change

### 10.2 Access Need Changes

**Requirement:** Notify system administrators if your access needs change.

**Examples:**
- New project requires additional access
- Role change eliminates need for current access
- Temporary access needed for specific task

**Notification Method:** Contact system administrator

**Timeframe:** Before access change is needed (for new access) or immediately (for access reduction)

---

## 11. Administrative Responsibilities (ADMIN Role Only)

### 11.1 User Account Management

**ADMIN Role Requirements:**
- Review user access periodically
- Conduct least privilege audits
- Revoke access when triggers occur (within 24 hours)
- Maintain account lifecycle documentation
- Review and approve access requests

**Related Procedure:** See `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`  
**Related Procedure:** See `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`

### 11.2 System Administration

**ADMIN Role Requirements:**
- Monitor system security events
- Review audit logs periodically
- Respond to security incidents
- Maintain system documentation
- Coordinate with Security Contact on security matters

### 11.3 Evidence Maintenance

**ADMIN Role Requirements:**
- Maintain physical access logs
- Maintain endpoint inventory
- Export audit logs for evidence (as needed)
- Maintain user acknowledgement forms
- Document access reviews and audits

---

## 12. Compliance Monitoring

### 12.1 Ongoing Compliance

**Requirement:** All stakeholders are responsible for ongoing compliance with these requirements.

**Monitoring:**
- System administrators monitor compliance through system logs and audits
- Access reviews verify least privilege compliance
- Annual re-acknowledgements document continued commitment
- Incident reports document security event handling

### 12.2 Non-Compliance Consequences

**Violation of ongoing requirements may result in:**
- Immediate revocation of system access
- Disciplinary action up to and including termination
- Legal consequences as applicable
- Reporting to Security Contact and, if contractually required, to contracting officer or customer

---

## 13. Related Documents

**Policies:**
- Access Control Policy (`MAC-POL-210_Access_Control_Policy.md`)
- Identification & Authentication Policy (`MAC-POL-211_Identification_and_Authentication_Policy.md`)
- Physical Security Policy (`MAC-POL-212_Physical_Security_Policy.md`)
- System Integrity Policy (`MAC-POL-214_System_Integrity_Policy.md`)
- Incident Response Policy (`MAC-POL-215_Incident_Response_Policy.md`)

**Procedures:**
- User Account Provisioning and Deprovisioning Procedure (`MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md`)
- Account Lifecycle Enforcement Procedure (`MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`)
- Incident Identification and Reporting Procedure (`MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md`)

**Forms:**
- User Access and FCI Handling Acknowledgement (`MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md`)

---

## 14. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 2.0 (2026-01-24): Updated from CMMC Level 2 to Level 2, updated scope to FCI and CUI, updated references to NIST SP 800-171 Rev. 2
- Version 1.0 (2026-01-22): Initial document creation for CMMC Level 2

---

**Document Status:** This document reflects the system state as of 2026-01-22 and is maintained under configuration control.
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-217-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-217-signoff.md`

