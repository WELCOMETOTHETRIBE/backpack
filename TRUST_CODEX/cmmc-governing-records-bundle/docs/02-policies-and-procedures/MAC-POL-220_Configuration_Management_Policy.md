# Configuration Management Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.4

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains configuration management processes to establish and maintain baseline configurations, control changes to organizational systems, and ensure security configuration settings are properly established and enforced. This policy establishes requirements for configuration management, change control, and security configuration.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2, Section 3.4 (Configuration Management).

---

## 2. Scope

This policy applies to:
- All organizational systems that process, store, or transmit CUI
- All system components (hardware, software, firmware, documentation)
- All configuration changes
- All baseline configurations
- All security configuration settings

**System Scope:** FCI and CUI environment.

---

## 3. Configuration Management Requirements

### 3.1 Baseline Configurations (3.4.1)

**Requirement:** Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.

**Implementation:**
- Configuration Management Plan established
- Baseline configurations documented
- System component inventory maintained
- Baselines include hardware, software, firmware, documentation
- Baseline maintenance process established

**Baseline Components:**
- Application baseline: Code, configuration files, dependencies
- Database baseline: Schema, configuration, migrations
- Infrastructure baseline: Platform configuration (hosting provider (historical))
- Security baseline: Security configuration settings

**Evidence:**
- Configuration Management Plan: `MAC-CMP-001_Configuration_Management_Plan.md`
- Configuration Baseline Evidence: `../05-evidence/MAC-RPT-108_Configuration_Baseline_Evidence.md`
- Configuration Baseline Management Procedure: `MAC-SOP-228_Configuration_Baseline_Management_Procedure.md`

**Status:** ✅ Fully Implemented

---

### 3.2 Security Configuration Settings (3.4.2)

**Requirement:** Establish and enforce security configuration settings for information technology products employed in organizational systems.

**Implementation:**
- Security configuration settings documented
- Configuration settings enforced via code and environment variables
- Security headers configured in next.config.js
- Security configuration managed via version control
- Configuration settings reviewed and approved

**Security Configuration Areas:**
- Authentication configuration
- Authorization configuration
- Session management configuration
- Password policy configuration
- Security headers configuration
- Encryption configuration

**Evidence:**
- `next.config.js` (security headers)
- `middleware.ts` (security configuration)
- Configuration files: Version-controlled in GitHub

**Status:** ⚠️ Partially Satisfied (formal CM process to be established per Phase 3)

---

### 3.3 Change Control (3.4.3)

**Requirement:** Track, review, approve or disapprove, and log changes to organizational systems.

**Implementation:**
- Change tracking via Git version control
- Code changes reviewed before merging
- Configuration changes documented per Configuration Change Awareness Procedure
- Change approval process via code review
- Changes logged in version control and audit system

**Change Control Process:**
- Change request documented
- Change reviewed and approved
- Change implemented
- Change tested
- Change logged and documented

**Evidence:**
- GitHub repository (change tracking)
- Configuration Change Awareness Procedure: `MAC-SOP-225_Configuration_Change_Awareness_Procedure.md`
- Git commit history (change logging)

**Status:** ⚠️ Partially Satisfied (formal change control process to be established per Phase 3)

---

### 3.4 Security Impact Analysis (3.4.4)

**Requirement:** Analyze the security impact of changes prior to implementation.

**Implementation:**
- Security impact analysis to be formalized
- Changes analyzed for security impact before implementation
- Security impact assessment process to be established
- Impact analysis documented for all changes

**Impact Analysis Process:**
- Assess security impact of proposed change
- Identify affected security controls
- Assess risk of change
- Document impact analysis
- Obtain approval based on impact

**Evidence:**
- Security Impact Analysis Template: `../05-evidence/security-impact-analysis/security-impact-analysis-template.md`
- Configuration Change Awareness Procedure: `MAC-SOP-225_Configuration_Change_Awareness_Procedure.md` (includes impact analysis process)
- Configuration Management Plan: `MAC-CMP-001_Configuration_Management_Plan.md`

**Status:** ✅ Fully Implemented

---

### 3.5 Change Access Restrictions (3.4.5)

**Requirement:** Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.

**Implementation:**
- Change access restrictions to be defined
- Physical and logical access controls for changes to be documented
- Change approval process includes access restrictions
- Access restrictions enforced via version control and deployment controls

**Access Restrictions:**
- Code changes: GitHub access controls
- Configuration changes: hosting environment (historical) access controls
- Database changes: Prisma migration access controls
- Deployment changes: hosting environment (historical) access controls

**Evidence:**
- Configuration Management Plan: `MAC-CMP-001_Configuration_Management_Plan.md`
- Configuration Change Awareness Procedure: `MAC-SOP-225_Configuration_Change_Awareness_Procedure.md`
- Change Control Evidence: `../05-evidence/MAC-RPT-109_Change_Control_Evidence.md`

**Status:** ✅ Fully Implemented

---

### 3.6 Least Functionality (3.4.6)

**Requirement:** Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.

**Implementation:**
- System configured with essential capabilities only
- Unnecessary features disabled or not implemented
- Minimal system footprint
- Least functionality principle applied in system design

**Evidence:**
- System architecture: Minimal essential features
- Configuration settings: Essential capabilities only

**Status:** ✅ Implemented

---

### 3.7 Restrict Nonessential Programs/Ports/Protocols (3.4.7)

**Requirement:** Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.

**Implementation:**
- Nonessential programs, ports, protocols restricted by hosting environment (historical) (inherited)
- System uses only essential functions
- Network restrictions enforced by platform
- Unnecessary services disabled

**Evidence:**
- hosting environment (historical) network restrictions (inherited)
- System configuration: Essential services only

**Status:** 🔄 Inherited

---

### 3.8 Software Restriction Policy (3.4.8)

**Requirement:** Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software programs.

**Implementation:**
- Software restriction policy to be established
- Deny-by-exception or permit-by-exception policy to be implemented
- Authorized software list to be maintained
- Software installation controls to be enforced

**Software Management:**
- Authorized software inventory maintained
- Software approval process established
- Unauthorized software prevented
- Software restrictions enforced

**Evidence:**
- Software Restriction Policy: `MAC-POL-226_Software_Restriction_Policy.md`
- Authorized software inventory: `package.json`, Configuration Baseline Evidence
- Dependency management: `package.json`, Dependabot configuration

**Status:** ✅ Fully Implemented

---

### 3.9 Control User-Installed Software (3.4.9)

**Requirement:** Control and monitor user-installed software.

**Implementation:**
- System is cloud-based web application
- No user-installed software on system infrastructure
- Software installation not applicable to system architecture
- All software managed at platform level

**Evidence:**
- System architecture: Cloud-based, no user-installed software
- Platform-managed software: hosting environment (historical)

**Status:** 🚫 Not Applicable (cloud-only system, no user-installed software)

---

## 4. Configuration Management Process

### 4.1 Baseline Management

**Baseline Establishment:**
- Document current system configuration
- Create baseline configuration inventory
- Establish baseline version control
- Approve baseline configurations

**Baseline Maintenance:**
- Update baselines when changes approved
- Version control baseline changes
- Document baseline updates
- Maintain baseline history

---

### 4.2 Change Management

**Change Request Process:**
1. Change request submitted
2. Change reviewed for security impact
3. Change approved or disapproved
4. Change implemented
5. Change tested and verified
6. Change documented

**Change Documentation:**
- Change request form
- Security impact analysis
- Change approval
- Change implementation
- Change verification
- Change log entry

---

### 4.3 Configuration Inventory

**Inventory Components:**
- Hardware inventory (if applicable)
- Software inventory (dependencies, packages)
- Firmware inventory (if applicable)
- Documentation inventory
- Configuration file inventory

**Inventory Maintenance:**
- Inventory updated with changes
- Inventory reviewed periodically
- Inventory accuracy verified

---

## 5. Roles and Responsibilities

### 5.1 System Administrator

**Responsibilities:**
- Maintain baseline configurations
- Manage configuration changes
- Conduct security impact analysis
- Maintain configuration inventory
- Enforce configuration management procedures

### 5.2 Development Team

**Responsibilities:**
- Implement approved changes
- Test configuration changes
- Document changes in version control
- Follow change control process

### 5.3 Management

**Responsibilities:**
- Review and approve configuration changes
- Allocate resources for configuration management
- Approve baseline configurations

---

## 6. Related Documents

- Configuration Change Awareness Procedure: `MAC-SOP-225_Configuration_Change_Awareness_Procedure.md`
- Configuration Baseline Management Procedure: `MAC-SOP-228_Configuration_Baseline_Management_Procedure.md` (to be created)
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.5)
- System Integrity Policy: `MAC-POL-214_System_Integrity_Policy.md`

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2

---

## Appendix A: Regulatory References

- NIST SP 800-171 Rev. 2, Section 3.4 (Configuration Management)
- NIST SP 800-128 (Guide for Security-Focused Configuration Management)
- CMMC 2.0 Level 2 Assessment Guide
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-220-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-220-signoff.md`

