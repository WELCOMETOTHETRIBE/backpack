# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-228_Configuration_Baseline_Management_Procedure.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# Configuration Baseline Management Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.4.1

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes the process for establishing and maintaining baseline configurations and inventories of organizational systems.

---

## 2. Scope

This procedure applies to:
- Baseline configuration establishment
- Baseline configuration maintenance
- Configuration inventory management
- Baseline version control

---

## 3. Baseline Configuration Process

### 3.1 Baseline Establishment

**Step 1: Document Current Configuration**
- Document application configuration
- Document database configuration
- Document infrastructure configuration
- Document security configuration
- Document all system components

**Step 2: Create Baseline Inventory**
- Create hardware inventory (if applicable)
- Create software inventory (dependencies, packages)
- Create firmware inventory (if applicable)
- Create documentation inventory
- Create configuration file inventory

**Step 3: Establish Baseline Version**
- Create baseline version identifier
- Document baseline date
- Approve baseline configuration
- Store baseline in version control

**Step 4: Document Baseline**
- Document baseline components
- Document baseline configuration settings
- Document baseline approval
- Maintain baseline documentation

---

### 3.2 Baseline Components

**Application Baseline:**
- Source code (Git repository)
- Dependencies (`package.json`)
- Configuration files (`next.config.js`, `middleware.ts`)
- Environment variable templates
- Build configuration

**Database Baseline:**
- Database schema (`prisma/schema.prisma`)
- Database migrations (`prisma/migrations/`)
- Database configuration
- Backup configuration

**Infrastructure Baseline:**
- hosting environment (historical) configuration
- Network configuration
- Security configuration
- Platform service configuration

**Security Baseline:**
- Authentication configuration
- Authorization configuration
- Password policy configuration
- Security headers configuration
- Encryption configuration

---

### 3.3 Baseline Maintenance

**Maintenance Triggers:**
- Approved configuration changes
- System updates
- Security patches
- New component additions

**Maintenance Process:**
1. Review proposed changes
2. Assess impact on baseline
3. Update baseline if change approved
4. Version control baseline update
5. Document baseline change
6. Update baseline inventory

---

## 4. Configuration Inventory

### 4.1 Inventory Components

**Software Inventory:**
- Application dependencies (`package.json`)
- Node.js version
- Framework versions (Next.js, React)
- Library versions
- Tool versions

**Configuration Inventory:**
- Configuration files
- Environment variables (templates)
- Security settings
- Feature flags

**Documentation Inventory:**
- System documentation
- Policy documents
- Procedure documents
- Architecture diagrams

---

### 4.2 Inventory Maintenance

**Update Frequency:**
- Updated with each configuration change
- Reviewed quarterly
- Verified for accuracy

**Inventory Documentation:**
- Inventory maintained in Configuration Baseline Inventory document
- Inventory version controlled
- Inventory reviewed and approved

---

## 5. Baseline Version Control

**Version Control:**
- Baselines version controlled in Git
- Baseline versions tagged
- Baseline history maintained
- Baseline changes tracked

**Version Identification:**
- Baseline version format: BASELINE-YYYY-MM-DD
- Version date corresponds to baseline establishment date
- Version history maintained

---

## 6. Roles and Responsibilities

**System Administrator:**
- Establish baseline configurations
- Maintain baseline inventory
- Update baselines with approved changes
- Document baseline changes

**Development Team:**
- Implement approved changes
- Update baseline documentation
- Maintain configuration inventory

**Management:**
- Approve baseline configurations
- Approve baseline changes
- Review baseline inventory

---

## 7. Related Documents

- Configuration Management Policy: `MAC-POL-220_Configuration_Management_Policy.md`
- Configuration Change Awareness Procedure: `MAC-SOP-225_Configuration_Change_Awareness_Procedure.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md`

---

## 8. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 1.0 (2026-01-23): Initial document creation for CMMC Level 2
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-228-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-228-signoff.md`



---
**QMS signature (SHA-256):** `e4c7048adf5a061a7dae8c56f941f82f260a7849178f4c4057a7751e3d0e0bdd`
