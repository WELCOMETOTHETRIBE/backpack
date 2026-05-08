# Procedures for Separation of Duties and System Management

**Document ID:** MAC-SOP-243  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.3 (Separate user and system management functionality)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how user functionality is separated from system management (administrative) functionality within the MacTech CUI enclave. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA. It supports both access control separation of duties (MAC-POL-210, MAC-SOP-235) and the technical separation of user vs. administrative functions on the VM and in Azure.

---

## 2. Scope

- **In scope:** Distinction between (1) standard user accounts and access used for normal CUI work on the Windows VM(s) and (2) administrative accounts and access used to manage the VM(s) and Azure subscription. Use of separate accounts, roles, and (where applicable) jump/bastion or dedicated management paths.
- **Out of scope:** Systems and workstations outside the Azure Government subscription.

---

## 3. Prerequisites

- Access Control Policy (MAC-POL-210) and Separation of Duties procedures/matrix (MAC-SOP-235).
- Azure role assignments and Windows local/domain groups defined for user vs. administrator roles.

---

## 4. Procedure

### 4.1 Separate administrative from user access (Azure and VM)

1. **Azure subscription and resource management.** Use Azure role-based access control (RBAC) so that:
   - **User role:** Personnel who only need to use the Windows VM for CUI work have access to connect (e.g., RDP) to the VM but do **not** have Azure roles that allow changing the VM, network, or subscription (e.g., no Contributor, no VM restart/deallocate, no NSG changes).
   - **Administrator role:** Personnel who perform system management have appropriate Azure roles (e.g., Contributor or custom role) and use **separate, dedicated administrative accounts** (not the same account used for standard user work). Document the role assignments and the principle that admin and user functions use different identities.
2. **Windows VM.** On the Windows VM(s):
   - Standard users have accounts that allow logon and use of authorized applications/data but do **not** have local Administrator or other privileged group membership.
   - System management (e.g., patching, configuration, user account provisioning) is performed using dedicated administrative accounts (local Administrator or designated admin accounts), **not** standard user accounts. Document how admin logon is performed (e.g., RDP with admin account, or Azure Bastion) and that it is separate from day-to-day user logon.

### 4.2 Management path (optional but recommended)

1. Where feasible, use a dedicated management path (e.g., Azure Bastion or a separate management subnet/VPN path) for administrative access to the VM(s), distinct from the path used by standard users for RDP. Document the approach (e.g., "Administrators use Azure Bastion; users use RDP over VPN").
2. If the same VPN and RDP path are used for both, separation is achieved by account and role (user vs. admin accounts and Azure RBAC), not by network path; document that and ensure account separation is enforced.

### 4.3 Alignment with separation of duties matrix

1. Ensure that the Separation of Duties Matrix (MAC-SOP-235) identifies incompatible duties (e.g., same person shall not both approve changes and implement them) and that system management roles on the enclave are assigned accordingly.
2. **Evidence.** Retain role assignment documentation (Azure RBAC summary, Windows group membership summary) and a brief narrative of how user vs. system management are separated. **Retention:** Minimum three (3) years per Records Retention Policy.

### 4.4 Review

1. **Frequency.** Review Azure RBAC and Windows VM admin/user account assignment at least annually or when personnel or roles change.
2. **Evidence.** Maintain dated summary or screenshot of role assignments and any changes.

---

## 5. Roles and Responsibilities

- **System owner / IT:** Assign Azure roles and Windows accounts; maintain separation between user and admin access; document configuration.
- **Compliance / Security:** Verify separation during assessments and ensure alignment with Access Control and this procedure.

---

## 6. Evidence and Records

- Azure RBAC role assignment summary (or screenshot) for the subscription/VM.
- Windows VM local/domain group membership summary for admin vs. user.
- Reference to Separation of Duties Matrix (MAC-SOP-235).
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Access Control Policy (MAC-POL-210)
- Procedures for Separation of Duties / Separation of Duties Matrix (MAC-SOP-235)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
