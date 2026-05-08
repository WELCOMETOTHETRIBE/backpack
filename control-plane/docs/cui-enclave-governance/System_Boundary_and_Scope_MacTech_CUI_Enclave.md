# System Boundary and Scope for MacTech CUI Enclave

**Document ID:** MAC-SCOPE-001  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date, or when boundary/scope changes

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This document defines the authorized system boundary and in-scope versus out-of-scope components for MacTech’s CUI (Controlled Unclassified Information) enclave. All CUI enclave governance policies and procedures apply only to the in-scope components described below. This document is the single source of truth for the MacTech CUI enclave boundary.

---

## 2. In-Scope Components

The following are **in scope** for the MacTech CUI enclave:

| Component | Description |
|-----------|-------------|
| **Microsoft Azure Government** | The Azure Government cloud service tenant and subscription used to host the CUI workload. This includes only MacTech’s Azure Government subscription(s) designated for CUI. |
| **Windows VM(s)** | Windows Server virtual machine(s) hosted inside the Azure Government subscription. These VMs are the CUI workload and process or store CUI. |
| **Authorized access path** | User access to the enclave is permitted only via: **(1)** Microsoft Entra ID (identity and authentication), **(2)** organization-managed VPN (network path into the Azure Government environment), and **(3)** multi-factor authentication (MFA). User work computers (organization-managed) connect through this path only; there is no direct internet exposure of the Windows VM(s). |

The boundary ends at the Azure Government subscription and the Windows VM(s) running within it. No other systems, clouds, or endpoints are part of the enclave.

---

## 3. Out-of-Scope Components

The following are **out of scope** and are not part of the CUI enclave boundary:

- **User work computers** — The workstations or devices used by personnel to connect to the enclave (via Entra ID, VPN, and MFA) are the access path only. They are not in scope as part of the enclave for this boundary definition.
- **Other clouds and on-premises systems** — Any other cloud providers, on-premises servers, or systems outside the Azure Government subscription described above are out of scope.
- **Public internet exposure of the Windows VM** — The Windows VM(s) are not directly exposed to the public internet; access is through the controlled VPN and Entra ID path. Any such direct exposure would be out of scope and prohibited.

---

## 4. Boundary Diagram (Narrative)

- **Cloud:** Microsoft Azure Government (tenant + subscription).
- **Workload:** Windows VM(s) inside the subscription (CUI processed/stored here).
- **Access:** Authorized users → Entra ID (identity + MFA) → VPN → Azure Government network → Windows VM(s). No other network path into the VM(s) is authorized for CUI access.

All governance documents in the CUI enclave set (policies and procedures referenced in the Governance Document Matrix) apply only to this boundary.

---

## 5. Review and Update

This document shall be reviewed at least annually or when the boundary or scope changes. Changes to in-scope or out-of-scope components require an update to this document, version control, and re-approval by the approval authority.

---

## 6. Approval

This document is approved for use as the system boundary and scope for the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |

---

*This document is the single source of truth for the MacTech CUI enclave boundary. All related policies and procedures must reference it and must not impose requirements on systems or components outside this scope.*
