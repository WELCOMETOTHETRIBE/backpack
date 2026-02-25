# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-225_Configuration_Change_Awareness_Procedure.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Configuration Change Awareness Procedure - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes requirements for awareness and documentation of configuration changes to the MacTech Solutions system. This procedure supports the System & Information Integrity Policy (`MAC-POL-214_System_Integrity_Policy.md`) and ensures that system administrators and relevant personnel are aware of configuration changes that may affect system security or FCI/CUI handling.

---

## 2. Scope

This procedure applies to:
- Application configuration changes
- Environment variable changes
- Database configuration changes
- Security configuration changes
- Infrastructure configuration changes (where applicable)

**Note:** Code changes are managed via Git version control and are outside the scope of this procedure. See System Integrity Policy Section 7.1 for code change management.

---

## 3. Configuration Change Categories

### 3.1 Application Configuration

**Examples:**
- Authentication settings
- Session timeout values
- Password policy settings
- Security headers configuration
- Feature flags

### 3.2 Environment Variables

**Examples:**
- Database connection strings
- Authentication secrets
- API keys
- Service URLs
- Feature toggles

### 3.3 Database Configuration

**Examples:**
- Database connection settings
- Backup configuration
- Retention policies
- Access control settings

### 3.4 Security Configuration

**Examples:**
- Password policy parameters
- Session configuration
- CUI blocking keyword lists
- Access control rules

---

## 4. Configuration Change Awareness Procedure

### 4.1 Pre-Change Awareness

**Step 1: Change Planning**
- Identify configuration change need
- Document change purpose and justification
- Conduct security impact analysis
- Plan change implementation
- Obtain approval for high-impact changes

**Step 2: Security Impact Analysis**
- Assess security impact of proposed change
- Identify affected security controls
- Assess risk of change
- Document impact analysis using Security Impact Analysis Template
- Obtain approval based on impact

**Security Impact Analysis:**
- Template: `../05-evidence/security-impact-analysis/security-impact-analysis-template.md`
- Required for all configuration changes
- Impact level determines approval requirements

**Step 3: Change Documentation**
- Document proposed change
- Record change date and time
- Note responsible party
- Document expected impact
- Document security impact analysis
- Document change approval

**Step 4: Change Notification (if applicable)**
- Notify relevant personnel of planned change
- Communicate change purpose and impact
- Provide change timeline

**Step 5: Change Approval**
- Review change for security impact
- Review security impact analysis
- Obtain approval for high-impact changes
- Document approval in change log
- Proceed with implementation after approval

### 4.2 Change Implementation

**Step 1: Access Configuration**
- Log in to hosting environment (historical) (for environment variables)
- Access configuration interface
- Verify authorization for change

**Step 2: Implement Change**
- Make configuration change
- Verify change is applied
- Test change if applicable

**Step 3: Document Change**
- Record change in change log
- Document change date, time, and responsible party
- Note change details and rationale

### 4.3 Post-Change Awareness

**Step 1: Verify Change**
- Verify change is active
- Test system functionality
- Verify security controls remain effective

**Step 2: Monitor Impact**
- Monitor system for issues
- Check for unexpected behavior
- Verify FCI handling is not affected

**Step 3: Document Results**
- Record change completion
- Note any issues or observations
- Update change log

---

## 5. Configuration Change Log

Configuration changes are documented in a change log with the following information:

| Date | Time | Configuration Type | Change Description | Changed By | Rationale | Impact Assessment | Approved By | Status |
|------|------|-------------------|-------------------|------------|-----------|-------------------|-------------|--------|
| 2026-01-15 | 10:30 | Environment Variable | Updated database connection string | admin@mactech.com | Database migration | Low - No security impact | System Admin | Completed |
| 2026-01-18 | 14:20 | Security Configuration | Updated password policy minimum length to 14 | admin@mactech.com | Security enhancement | Medium - Affects all users | System Admin | Completed |

**Change Log Fields:**
- **Date:** Date of change
- **Time:** Time of change
- **Configuration Type:** Category of configuration (Environment Variable, Security Configuration, etc.)
- **Change Description:** Brief description of what changed
- **Changed By:** Email or identifier of person making change
- **Rationale:** Reason for change
- **Impact Assessment:** Assessment of security or operational impact (Low, Medium, High)
- **Approved By:** Person who approved the change (for high-impact changes)
- **Status:** Change status (Planned, Approved, In Progress, Completed, Rolled Back)

**Change Control Evidence:**
- Change Control Evidence: `../05-evidence/MAC-RPT-109_Change_Control_Evidence.md`

---

## 6. Security Configuration Changes

### 6.1 High-Impact Security Changes

The following configuration changes require enhanced awareness and documentation:

- Password policy changes
- Authentication configuration changes
- Access control rule changes
- CUI blocking keyword list updates
- Session configuration changes

**Procedure for High-Impact Changes:**
1. Document change rationale and security impact
2. Notify system administrators
3. Test change in non-production if possible
4. Implement change during maintenance window if applicable
5. Monitor closely after implementation
6. Document results and any issues

### 6.2 Change Validation

After security configuration changes:
- Verify authentication still works
- Verify access controls are enforced
- Verify password policy is applied
- Verify CUI blocking is functional
- Test user access and permissions

---

## 7. Environment Variable Management

### 7.1 hosting environment (historical) Environment Variables

**Access:**
- Log in to hosting environment (historical)
- Navigate to project settings
- Access environment variables section

**Change Procedure:**
1. Identify variable to change
2. Document current value (if sensitive, note "REDACTED")
3. Update variable value
4. Save changes
5. Document change in change log
6. Verify application restarts with new configuration

**Security Considerations:**
- Never commit environment variables to source code
- Use hosting environment (historical) for secret management
- Document variable changes but not actual values (if sensitive)
- Verify `.gitignore` excludes `.env` files

---

## 8. Configuration Change Awareness Requirements

### 8.1 System Administrator Awareness

System administrators must:
- Be aware of all configuration changes
- Review change log regularly
- Understand impact of security configuration changes
- Verify changes do not compromise security controls

### 8.2 Change Documentation

All configuration changes must be:
- Documented in change log
- Dated and timestamped
- Attributed to responsible party
- Rationale documented

### 8.3 Change Review

Configuration changes should be reviewed:
- Before implementation (for high-impact changes)
- After implementation (to verify effectiveness)
- Periodically (to ensure change log is current)

---

## 9. Related Documents

- System & Information Integrity Policy (`MAC-POL-214_System_Integrity_Policy.md`)
- Access Control Policy (`MAC-POL-210_Access_Control_Policy.md`)
- Identification & Authentication Policy (`MAC-POL-211_Identification_and_Authentication_Policy.md`)

---

## 10. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.0 (2026-01-21): Initial document creation

---

**Document Status:** This document reflects the system state as of 2026-01-21 and is maintained under configuration control.

---
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-225-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-225-signoff.md`



---
**QMS signature (SHA-256):** `315902861a8c8b40f332b9be8fbc12f580b3ef6582affe7c772a50e225ab74ee`
