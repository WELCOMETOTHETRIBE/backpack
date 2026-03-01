# Policy for Authentication Feedback (Obscure Feedback)

**Document ID:** MAC-POL-228  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** IA.L2-3.5.11 (Obscure feedback during authentication)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This policy requires that authentication feedback on in-scope systems does not reveal information that could assist an unauthorized user (e.g., whether the username or password was incorrect). It applies only to the MacTech CUI enclave as defined in the System Boundary and Scope document (MAC-SCOPE-001).

---

## 2. Scope

This policy applies to:

- The Windows VM(s) hosted in the Microsoft Azure Government subscription that comprise the CUI enclave.
- Any interactive logon or authentication interface presented to users when accessing the enclave (including Entra ID sign-in and Windows logon to the VM).

It does not apply to systems or endpoints outside the boundary (e.g., user work computers except where they display feedback for enclave access).

---

## 3. Policy Statements

1. **Obscure feedback.** During authentication (logon, MFA challenge, or password entry), the system must not display feedback that reveals whether the username, password, or other credential component is correct or incorrect. Generic messages (e.g., "Invalid logon attempt" or "Unable to sign in") shall be used instead of messages that distinguish between "invalid username" and "invalid password."

2. **Configuration.** Windows VM(s) in the enclave shall be configured (via Group Policy or equivalent) to obscure authentication feedback consistent with NIST SP 800-171 and CMMC requirements. Entra ID and VPN authentication flows used for enclave access shall use feedback options that do not reveal credential validity.

3. **Review.** Configuration supporting this policy shall be reviewed at least annually and after any change to authentication mechanisms within the enclave.

---

## 4. Roles and Responsibilities

- **System owner / IT:** Configure and maintain authentication feedback settings on the Windows VM(s) and ensure Entra ID/VPN sign-in options align with this policy.
- **Compliance / Security:** Verify compliance during control assessments and report exceptions.

---

## 5. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Identification and Authentication Policy (MAC-POL-211)
- Records Retention Policy (as applicable)

---

## 6. Approval

This policy is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
