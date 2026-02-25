# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md`

**Status:** This is a *sanitized, platform-agnostic template copy* intended for reuse in a new project.
It removes or redacts environment/provider-specific assumptions (hosting provider names, OS-specific references, IP addresses).

**Rules for reuse**
- Do **not** treat this as an authoritative SSP/SCTM/policy implementation claim for any current environment.
- Validate and tailor every control statement, role, tool, and evidence reference for your target enclave.

---

# System & Information Integrity Policy - CMMC Level 2

**Document Version:** 2.0  
**Date:** 2026-01-24  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Policy Statement

MacTech Solutions maintains system and information integrity controls to protect Federal Contract Information (FCI) and Controlled Unclassified Information (CUI) and system resources from malicious code, unauthorized changes, and vulnerabilities. This policy establishes requirements for malware protection, system patching, and vulnerability management.

This policy aligns with CMMC Level 2 requirements and NIST SP 800-171 Rev. 2.

---

## 2. Scope

This policy applies to:
- All system components (application, database, infrastructure)
- All software dependencies and libraries
- All system updates and patches
- All vulnerability management activities

---

## 3. Malware Protection

### 3.1 Malware Protection (NIST SP 800-171 Rev. 2, Section 3.14.2)

**Requirement:** Systems must be protected from malicious code.

**Implementation:**
- Malware protection is provided by the hosting provider (historical) cloud platform
- hosting environment (historical) includes malware protection and security scanning
- Application dependencies are managed via npm package manager
- No additional endpoint protection software is installed on application servers

**Inherited Controls:**
- hosting environment (historical) provides infrastructure-level malware protection
- Platform security includes automated threat detection
- Network-level protections against malicious traffic

**Status:** Inherited control from hosting environment (historical)

**Coverage:** All application and database infrastructure hosted on hosting provider (historical)

---

### 3.2 Application-Level Protections

**Input Validation:**
- All user inputs are validated using Zod schemas
- SQL injection prevention via Prisma ORM (parameterized queries)
- XSS risk mitigation via React framework output encoding
- Evidence: Input validation throughout application code

**Framework Protections:**
- Next.js framework features are implemented as described
- Framework-level protections are implemented. No additional CSRF controls are required for Level 1.
- Session management via NextAuth.js with token-based authentication

### 3.3 Endpoint Protection (SI.L1-3.14.2)

**Requirement:** Endpoints used to access/administer the system must have antivirus/endpoint protection enabled and verified.

**Implementation:**
- Endpoint inventory module tracks all endpoints used to access/administer the system
- Each endpoint entry includes:
  - Device identifier (hostname, serial number, etc.)
  - Owner name
  - Operating system
  - Antivirus enabled status (yes/no)
  - **Last verification date:** Required field documenting when AV status was last verified
  - **Verification method:** Required field documenting how verification was performed (e.g., "AV status check", "Defender screenshot", "EDR Dashboard", "Manual verification")
  - Notes field for additional information

**Verification Process:**
- Endpoint antivirus status is verified using the Endpoint AV Verification template (`05-evidence/templates/endpoint-av-verification-template.md`)
- Verification records document the verification method used (screenshot, EDR dashboard, Defender UI, etc.)
- Completed verification records are stored with evidence
- Endpoint inventory is updated with last verification date and verification method

**Evidence:**
- Endpoint inventory: `/admin/endpoint-inventory`
- Database: `EndpointInventory` table (includes `lastVerifiedDate` and `verificationMethod` fields)
- Endpoint AV Verification template: `05-evidence/templates/endpoint-av-verification-template.md`
- Endpoint Protection document: `06-supporting-documents/MAC-SEC-101_Endpoint_Protection.md`

**Status:** ✅ **Implemented** - Endpoint inventory module tracks endpoint AV status with verification evidence

---

## 4. System Patching

### 4.1 Patching Responsibilities

**Application Dependencies:**
- Dependencies are managed via npm and `package.json`
- Dependencies are updated during development cycles
- Security updates are applied as they become available
- Evidence: `package.json` (dependencies and devDependencies)

**Infrastructure Patching:**
- hosting environment (historical) manages infrastructure patching
- Platform updates are managed by hosting environment (historical)
- No manual infrastructure patching required by organization

**Status:** Infrastructure patching is inherited from hosting environment (historical)

---

### 4.2 Dependency Management

**Package Management:**
- Dependencies are defined in `package.json`
- Dependencies are installed via npm
- Dependency versions are specified in `package.json`
- Evidence: `package.json`

**Key Dependencies:**
- Next.js 14.0.4
- NextAuth.js 5.0.0-beta.30
- Prisma 5.22.0
- bcryptjs 3.0.3
- React 18.2.0
- Evidence: `package.json` (lines 21-38)

**Dependency Updates:**
- Dependencies are reviewed and updated during development cycles
- Security advisories are monitored
- Updates are tested before deployment

---

### 4.3 Patching Process

**Process:**
1. Security advisories are reviewed
2. Vulnerable dependencies are identified
3. Updates are tested in development environment
4. Updates are applied to production via deployment
5. Deployment includes dependency updates

**Deployment:**
- Updates are deployed via hosting environment (historical)
- Build process includes `npm install` to update dependencies
- Evidence: `railway.json`, `package.json` build scripts

---

## 5. Vulnerability Management

### 5.1 Vulnerability Awareness

**Process:**
- Dependencies are reviewed for known vulnerabilities
- Security advisories are monitored
- npm audit may be used to identify vulnerabilities
- Vulnerabilities are addressed during development cycles

**Vulnerability Sources:**
- npm security advisories
- GitHub security advisories
- Framework and library security announcements
- CVE databases

---

### 5.2 Vulnerability Response

**Process:**
1. Vulnerability is identified
2. Severity is assessed
3. Update or patch is identified
4. Update is tested
5. Update is deployed to production

**Timeline:**
- Critical vulnerabilities are addressed promptly
- High-severity vulnerabilities are addressed in next development cycle
- Medium and low-severity vulnerabilities are addressed as resources permit

---

### 5.3 Dependency Vulnerability Scanning

**Tools:**
- npm audit (available via npm)
- GitHub Dependabot (enabled)
- Manual review of security advisories

**Process:**
- Dependencies are automatically scanned for known vulnerabilities via GitHub Dependabot
- Dependabot runs weekly scans (Mondays at 9:00 AM)
- Security updates are automatically grouped and presented as pull requests
- Vulnerabilities are documented in Dependabot alerts
- Remediation plans are developed
- Updates are applied and tested via pull request review process

**Implementation:**
- GitHub Dependabot is configured to scan npm dependencies weekly
- Security updates are automatically identified and grouped
- Pull requests are created for security updates
- Major version updates are excluded (require manual review)
- Evidence: `.github/dependabot.yml`

**Status:** ✅ **Implemented** - Automated vulnerability scanning via GitHub Dependabot

---

## 6. System Integrity Monitoring

### 6.1 Application Monitoring

**Logging:**
- Application logs are available through hosting environment (historical)
- Errors are logged to console
- Logs are accessible via hosting provider (historical) dashboard

**Monitoring:**
- hosting environment (historical) provides application monitoring
- Performance metrics are available
- Error tracking is available through platform

**Status:** Monitoring is provided by hosting environment (historical) (inherited control)

---

### 6.2 Database Integrity

**Database Management:**
- Database is managed via Prisma ORM
- Database migrations are version-controlled
- Database schema is defined in `prisma/schema.prisma`
- Evidence: `prisma/schema.prisma`, `prisma/migrations/`

**Database Backups:**
- hosting environment (historical) provides database backups
- Backup retention is managed by hosting provider (historical)
- Backup restoration is available through hosting provider (historical)

**Status:** Database backups are provided by hosting environment (historical) (inherited control)

---

## 7. Change Management

### 7.1 Code Changes

**Version Control:**
- All code changes are managed via Git
- Source code is stored in GitHub
- Changes are reviewed before merging
- Evidence: GitHub repository

**Deployment:**
- Changes are deployed via hosting environment (historical)
- Deployment process includes build and migration steps
- Evidence: `railway.json`, `Procfile`

---

### 7.2 Configuration Changes

**Configuration Management:**
- Environment variables are managed via hosting environment (historical)
- Configuration changes are documented
- Configuration is version-controlled where possible

**Security Configuration:**
- Authentication secrets are stored as environment variables
- Database connection strings are stored as environment variables
- No secrets are committed to source code
- Evidence: `.gitignore` excludes `.env` files

---

## 8. Compliance Risks & Open Items

### 8.1 Automated Vulnerability Scanning

**Status:** ✅ **Implemented** - Automated vulnerability scanning is implemented via GitHub Dependabot. Dependabot performs weekly scans of npm dependencies, automatically identifies security vulnerabilities, and creates pull requests for security updates. Dependencies are also reviewed manually and via npm audit as needed.

**Evidence:** `.github/dependabot.yml`

---

### 8.2 Formal Patch Management Process

**Status:** Patch management is performed during development cycles. Formal patch management procedures and schedules may be documented as a future enhancement.

---

### 8.3 Security Incident Response

**Status:** Security incident response procedures may be documented as a future enhancement. Current focus is on vulnerability management and patching.

---

### 8.4 Non-Required Hardening Items (Future Enhancements)

**Note:** The following items represent potential future enhancements but are not required for current CMMC Level 2 compliance:
- Security information and event management (SIEM) - Future enhancement
- Intrusion detection systems (IDS) - Future enhancement
- Formal security testing and penetration testing - Future enhancement

**Current Implementation:** Automated dependency vulnerability scanning (Dependabot) is implemented. See Section 5.3 for details.

---

## 9. Procedures

### 9.1 Dependency Update Procedure

1. Review security advisories and vulnerability reports
2. Identify dependencies requiring updates
3. Test updates in development environment
4. Update `package.json` with new versions
5. Run `npm install` to update dependencies
6. Test application functionality
7. Deploy updates to production via hosting provider (historical)

---

### 9.2 Vulnerability Response Procedure

1. Identify vulnerability (via advisory, scan, or report)
2. Assess severity and impact
3. Identify available patch or update
4. Test patch or update in development
5. Deploy patch or update to production
6. Verify patch or update is effective
7. Document resolution

---

### 9.3 System Update Procedure

1. Review available updates
2. Test updates in development environment
3. Update code and dependencies
4. Run database migrations if needed
5. Deploy updates via hosting environment (historical)
6. Verify system functionality
7. Monitor for issues

---

## 10. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Change History:**
- Version 2.0 (2026-01-24): Updated from CMMC Level 2 to Level 2, updated scope to FCI and CUI, updated references to NIST SP 800-171 Rev. 2
- Version 1.0 (2026-01-21): Initial document creation for CMMC Level 2

---

## Appendix A: Evidence Locations

| Control | Evidence Location |
|---------|------------------|
| Dependencies | `package.json` |
| Automated Vulnerability Scanning | `.github/dependabot.yml` |
| Database Schema | `prisma/schema.prisma` |
| Database Migrations | `prisma/migrations/` |
| Deployment Config | `railway.json`, `Procfile` |
| Environment Variables | hosting environment (historical) configuration |
| Source Code | GitHub repository |

## Appendix B: NIST SP 800-171 Rev. 2 Mapping

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| 3.14.2 | Malicious code protection | hosting environment (historical) (inherited) + application-level protections (input validation, SQL injection prevention, XSS mitigation) |
| 3.11.2 | Scan for vulnerabilities | Automated scanning (Dependabot), manual review, and npm audit |
| 3.11.3 | Remediate vulnerabilities | Vulnerability remediation process and timelines |
---

## Signature & evidence record (enclave deployment)

This template is signed using the **Trust Codex Manual** Governance workflow.

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-214-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-POL-214-signoff.md`



---
**QMS signature (SHA-256):** `1386c254bd2664ff57d9cd30a5a2531752bf8099342fc4b3d4fc00ce423ff8b4`
