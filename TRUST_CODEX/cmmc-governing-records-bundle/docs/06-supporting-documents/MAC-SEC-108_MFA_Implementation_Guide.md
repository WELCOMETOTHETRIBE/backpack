# MFA Implementation Guide - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-01-23  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2, Section 3.5.3

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

This guide documents the multifactor authentication (MFA) implementation for privileged accounts (ADMIN role) as required by NIST SP 800-171 Rev. 2, Section 3.5.3.

---

## 2. Requirement

**NIST SP 800-171 Rev. 2, Section 3.5.3:**
"Use multifactor authentication for local and network access to privileged accounts and for network access to nonprivileged accounts."

**CMMC Level 2 Requirement:**
- MFA required for all privileged accounts (ADMIN role)
- MFA required for network access to privileged accounts

---

## 3. MFA Solution Assessment

### 3.1 MFA Solution Options

**Option 1: NextAuth.js with TOTP Provider**
- **Pros:** Native NextAuth.js integration, TOTP standard, no external dependencies
- **Cons:** Requires TOTP app setup for each user
- **Implementation:** Add TOTP provider to NextAuth.js configuration
- **Cost:** Free (open source)

**Option 2: NextAuth.js with Email OTP**
- **Pros:** Simple implementation, no app required
- **Cons:** Email delivery dependency, less secure than TOTP
- **Implementation:** Add email OTP to NextAuth.js
- **Cost:** Free (email service)

**Option 3: Third-Party MFA Service (Authy, Duo, etc.)**
- **Pros:** Managed service, additional features
- **Cons:** External dependency, cost, vendor lock-in
- **Implementation:** Integrate third-party MFA service
- **Cost:** Varies by provider

### 3.2 Recommended Solution

**Selected Solution:** NextAuth.js with TOTP Provider

**Rationale:**
- Native integration with existing authentication system
- Industry-standard TOTP (RFC 6238)
- No external dependencies or costs
- Sufficient security for CMMC Level 2 requirements
- User-friendly (works with standard TOTP apps like Google Authenticator, Authy)

---

## 4. MFA Implementation Plan

### 4.1 Implementation Steps

**Step 1: Install TOTP Dependencies**
- Install `@otplib/preset-default` or similar TOTP library
- Update NextAuth.js configuration

**Step 2: Configure TOTP Provider**
- Add TOTP provider to NextAuth.js
- Configure TOTP settings (issuer, algorithm, etc.)
- Set up TOTP secret storage in database

**Step 3: Update Database Schema**
- Add MFA fields to User model (if needed)
- Add TOTP secret storage
- Add MFA enrollment status

**Step 4: Implement MFA Enrollment**
- Create MFA enrollment UI
- Generate TOTP secrets
- Display QR code for TOTP app setup
- Verify TOTP code during enrollment

**Step 5: Implement MFA Authentication**
- Require MFA for ADMIN role login
- Prompt for TOTP code after password authentication
- Verify TOTP code
- Complete authentication

**Step 6: Update User Interface**
- Add MFA enrollment page
- Add MFA verification prompt
- Update login flow

**Step 7: Testing**
- Test MFA enrollment
- Test MFA authentication
- Test MFA failure handling
- Test MFA recovery (if implemented)

**Step 8: Documentation**
- Update Identification and Authentication Policy
- Create MFA user guide
- Document MFA implementation

---

### 4.2 Implementation Timeline

**Phase 1, Weeks 3-4:**
- Week 3: MFA solution selection, design, and initial implementation
- Week 4: Complete implementation, testing, and documentation

**Target Completion:** 2026-02-20

---

## 5. MFA Configuration

### 5.1 TOTP Settings

**Recommended Settings:**
- Algorithm: SHA1 (standard)
- Digits: 6 (standard)
- Period: 30 seconds (standard)
- Issuer: "MacTech Solutions"
- Label: User email or identifier

### 5.2 MFA Enforcement

**Enforcement Rules:**
- MFA required for all ADMIN role accounts
- MFA required on every login (not just first login)
- MFA bypass not allowed for ADMIN accounts
- MFA optional for USER role (future enhancement)

---

## 6. User Experience

### 6.1 MFA Enrollment

**Enrollment Process:**
1. User logs in with password
2. System detects ADMIN role and MFA not enrolled
3. User redirected to MFA enrollment page
4. System generates TOTP secret
5. QR code displayed for TOTP app scanning
6. User scans QR code with TOTP app
7. User enters TOTP code to verify
8. MFA enrollment complete

### 6.2 MFA Authentication

**Authentication Process:**
1. User enters email and password
2. Password verified
3. System detects ADMIN role and MFA required
4. User prompted for TOTP code
5. User enters TOTP code from app
6. TOTP code verified
7. Authentication complete, session created

---

## 7. MFA Recovery

### 7.1 Recovery Options

**Recovery Methods:**
- Backup codes (recommended)
- Admin-assisted recovery
- Account reset process

**Backup Codes:**
- Generate backup codes during enrollment
- Store backup codes securely (hashed)
- Allow backup code use for MFA verification
- Regenerate backup codes as needed

---

## 8. Security Considerations

### 8.1 TOTP Secret Storage

**Storage Requirements:**
- TOTP secrets stored encrypted in database
- Secrets never exposed in logs or UI
- Secret generation uses cryptographically secure random

### 8.2 MFA Bypass Prevention

**Bypass Controls:**
- No MFA bypass for ADMIN accounts
- MFA required for all ADMIN logins
- MFA status verified on every authentication

### 8.3 Audit Logging

**MFA Events Logged:**
- MFA enrollment
- MFA authentication success
- MFA authentication failure
- MFA recovery actions

---

## 9. Testing

### 9.1 Test Scenarios

**Test Cases:**
1. MFA enrollment for new ADMIN user
2. MFA authentication with valid TOTP code
3. MFA authentication with invalid TOTP code
4. MFA authentication with expired TOTP code
5. MFA recovery using backup codes
6. MFA enforcement for ADMIN role
7. MFA not required for USER role (if applicable)

### 9.2 Test Results

**Test Results:** To be documented after implementation

---

## 10. Evidence

**MFA Implementation Evidence:**
- Code implementation: `lib/auth.ts` (MFA integration)
- Database schema: `prisma/schema.prisma` (MFA fields)
- MFA enrollment UI: `app/auth/mfa/enroll/page.tsx` (to be created)
- MFA verification: Authentication flow
- MFA configuration: NextAuth.js TOTP provider configuration

**Evidence Document:**
- `../05-evidence/MAC-RPT-104_MFA_Implementation_Evidence.md` (to be created)

---

## 11. Related Documents

- Identification and Authentication Policy: `../02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md`
- System Security Plan: `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 7.2, 3.5.3)
- POA&M Item: `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md` (POAM-001)

---

## 12. Document Control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*

**Change History:**
- Version 1.0 (2026-01-23): Initial MFA implementation guide created for CMMC Level 2

---

## Appendix A: TOTP Implementation Resources

- NextAuth.js TOTP Provider: https://next-auth.js.org/providers/totp
- RFC 6238 (TOTP): https://tools.ietf.org/html/rfc6238
- OTPLib Documentation: https://github.com/yeojz/otplib
