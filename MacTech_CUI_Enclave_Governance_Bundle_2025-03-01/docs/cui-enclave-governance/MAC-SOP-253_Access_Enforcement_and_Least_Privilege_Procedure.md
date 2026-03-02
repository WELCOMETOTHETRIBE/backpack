# Access Enforcement and Least Privilege Procedure

**Document ID:** MAC-SOP-253  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.1.5 (Least privilege); SC.L2-3.1.6 (Non-privileged accounts); SC.L2-3.1.7 (Prevent non-privileged users from executing privileged functions)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave enforces access control decisions (allow/deny), applies least privilege for users and processes, ensures non-privileged accounts for non-administrative use, and prevents non-privileged users from executing privileged functions. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Access enforcement (authorization checks) for access to the Windows VM(s) and Azure resources; assignment of least privilege (roles and permissions) in Entra ID and Azure RBAC; use of non-privileged accounts for normal user work; restriction of privileged functions to designated roles; periodic review of access.
- **Out of scope:** Access control on systems outside the enclave; identity proofing and authentication (governed by MAC-POL-211 and related procedures).

---

## 3. Prerequisites

- Access Control Policy (MAC-POL-210); User Account Provisioning and Deprovisioning Procedure (MAC-SOP-221); Entra ID and Azure RBAC in use for the enclave; defined roles (e.g., CUI user, VM administrator, subscription contributor) with documented permissions.

---

## 4. Procedure

### 4.1 Access enforcement

1. **Enforce access decisions.** Every request for access to enclave resources (e.g., sign-in to VM, access to Azure resource) shall be checked against authorization policy. Access is allowed only if the user or identity has been granted the required role or permission. Deny by default; permit only when explicitly authorized. Document how enforcement is implemented (e.g., Entra ID conditional access, Azure RBAC, Windows local/domain group membership).
2. **Consistency.** Ensure access enforcement is applied consistently across the enclave (no bypass for specific users unless documented and approved). Retain evidence of role assignments and permission sets.

### 4.2 Least privilege

1. **Principle.** Grant users and processes only the minimum access necessary to perform their job functions. Do not grant broad or administrative access for routine tasks. Document the roles and their permissions (e.g., CUI users: RDP to VM, no Azure subscription admin; VM admins: VM-level admin, no subscription owner).
2. **Review.** Periodically (at least annually) review role assignments and permissions; remove unnecessary access; adjust when job functions change. Document review and any changes.

### 4.3 Non-privileged accounts for non-administrative use

1. **Requirement.** Users who do not need to perform administrative functions shall use non-privileged accounts (e.g., standard user on the Windows VM(s); Entra ID user with no Azure RBAC admin roles). Administrative accounts (e.g., VM local administrator, Azure subscription contributor) shall be separate and used only for administrative tasks.
2. **Implementation.** Per MAC-SOP-221, provision standard (non-privileged) accounts for CUI users. Do not assign Azure Owner, Contributor, or other privileged roles to users who only need to access the VM for normal work. Document which accounts are privileged and which are non-privileged.

### 4.4 Prevent non-privileged users from executing privileged functions

1. **Technical controls.** Configure the system so that privileged functions (e.g., install software, change firewall, manage Azure resources) cannot be executed by non-privileged users. Use Windows local policy or group policy to restrict standard users; use Azure RBAC so that only designated roles can perform subscription or resource management. Document the controls (e.g., “Standard users are not in Administrators group; Azure Contributor limited to designated admins”).
2. **No elevation by default.** Do not grant users the ability to elevate to administrator or to assume privileged roles without a separate, approved process (e.g., just-in-time access or break-glass procedure if defined).

### 4.5 Periodic access review

1. **Frequency.** Perform access reviews at least annually: list users and roles for the enclave; confirm each user still requires their current access; remove or reduce access for users who no longer need it. Document the review (date, reviewer, findings, changes made).
2. **Triggered reviews.** Conduct a review when a user’s role changes, when they leave the organization, or after a security incident. Per MAC-SOP-221, deprovision access when users are offboarded.

### 4.6 Evidence and records

1. **Evidence.** Retain current role/permission documentation; access review records; list of privileged vs. non-privileged accounts. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/identity administrator:** Assign roles and permissions per this procedure and MAC-SOP-221; perform access reviews; remove excess access.
- **Security / Compliance:** Verify access enforcement and least privilege during assessments; ensure alignment with MAC-POL-210.
- **Users:** Use only the account and access assigned; do not attempt to gain or use privileged access without authorization.

---

## 6. Evidence and Records

- Role and permission matrix or documentation; list of privileged accounts.
- Access review records (date, reviewer, changes); provisioning/deprovisioning records (MAC-SOP-221).
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Access Control Policy (MAC-POL-210)
- User Account Provisioning and Deprovisioning Procedure (MAC-SOP-221)
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
