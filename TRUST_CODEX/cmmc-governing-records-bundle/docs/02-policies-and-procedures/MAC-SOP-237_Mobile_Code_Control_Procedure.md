# Mobile Code Control Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.13.13

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This procedure establishes requirements for controlling and monitoring the use of mobile code within the MacTech Solutions system.

---

## 2. Scope

This procedure applies to:
- Mobile code technologies (JavaScript, iframes, etc.)
- Third-party scripts and libraries
- Embedded content
- Dynamic code execution

---

## 3. Mobile Code Restrictions

### 3.1 Prohibited Mobile Code

**Prohibited Technologies:**
- Java applets (not used)
- ActiveX controls (not used)
- Unsigned mobile code
- Unauthorized third-party scripts

---

### 3.2 Allowed Mobile Code

**Allowed Technologies:**
- JavaScript (standard web application code)
- React/Next.js framework code
- Authorized third-party libraries (from npm)
- Content Security Policy (CSP) enforced

---

## 4. Mobile Code Control Measures

### 4.1 Content Security Policy

**CSP Implementation:**
- Content Security Policy configured
- Script sources restricted
- Inline scripts restricted
- External sources controlled

**Evidence:**
- CSP configuration: `next.config.js`, `lib/security-headers.ts`

---

### 4.2 Third-Party Code Review

**Review Process:**
- Third-party libraries reviewed before use
- Dependencies tracked in `package.json`
- Security vulnerabilities monitored
- Updates applied when available

---

## 5. Mobile Code Monitoring

### 5.1 Monitoring Activities

**Monitoring:**
- Third-party script usage tracked
- Dependency vulnerabilities monitored
- Code execution monitored via audit logs
- Security events logged

---

## 6. Related Documents

- System and Communications Protection Policy: `MAC-POL-225_System_and_Communications_Protection_Policy.md`
- Mobile Code Control Evidence: `../05-evidence/MAC-RPT-117_Mobile_Code_Control_Evidence.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.13, 3.13.13)

---

## 7. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*
**Next Review Date:** 2026-04-23

**Change History:**
- Version 1.0 (2026-01-23): Initial procedure creation
---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).

**What counts as the approval record** is the per-document sign-off artifact written under `C:\evidence`, which includes:
- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-237-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-237-signoff.md`

