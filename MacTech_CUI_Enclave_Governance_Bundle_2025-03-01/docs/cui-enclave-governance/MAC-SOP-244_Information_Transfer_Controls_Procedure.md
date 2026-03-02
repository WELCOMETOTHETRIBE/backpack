# Procedures for Information Transfer Controls

**Document ID:** MAC-SOP-244  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.4 (Prevent unauthorized information transfer)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave prevents unauthorized transfer of CUI outside the boundary and controls the flow of information within the boundary. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** CUI processed or stored on the Windows VM(s) and within the Azure Government subscription; network and configuration controls that prevent CUI from being transferred to unauthorized systems (e.g., no unapproved export to internet, no cross-tenant leakage); user and administrative practices that support controlled transfer (e.g., no copying CUI to out-of-scope devices).
- **Out of scope:** Information flow controls on systems outside the Azure Government subscription (except where user work computers are explicitly addressed by policy for enclave access).

---

## 3. Prerequisites

- Network security groups (NSGs) or equivalent in Azure Government configured to restrict traffic to/from the Windows VM(s) (deny-by-default, permit-by-exception).
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204) or equivalent that prohibit unauthorized transfer of CUI.
- Administrative access to document and verify VM and network configuration.

---

## 4. Procedure

### 4.1 Restrict network flow (Azure and VM)

1. **Azure NSGs and network design.** Ensure that the Windows VM(s) are not exposed to the public internet. All access to the VM(s) shall be via MacTech’s VPN and Entra ID path (or approved management path such as Azure Bastion). Document the NSG rules (or equivalent) that restrict inbound/outbound traffic so that:
   - **Inbound:** Only authorized sources (e.g., VPN gateway, Bastion) can reach the VM.
   - **Outbound:** Restrict as appropriate to prevent CUI exfiltration (e.g., block unnecessary outbound to internet; allow only required endpoints for updates, monitoring, or approved services). Document any allowed outbound destinations and business justification.
2. **Windows Firewall.** On the Windows VM(s), use Windows Firewall with deny-by-default for inbound and, where feasible, restrict outbound to required traffic. Document high-level rules or retain export for evidence.

### 4.2 Prevent cross-tenant and unauthorized transfer

1. **Azure Government isolation.** Rely on Azure Government’s physical and logical isolation from commercial Azure and other tenants. Document that CUI remains within MacTech’s Azure Government subscription and is not shared with other tenants or clouds.
2. **No unapproved export.** Policy and user training (per MAC-FRM-204) shall prohibit copying, printing, or transferring CUI to removable media, personal devices, or external systems not authorized for CUI. Enforcement is through policy, training, and (where applicable) technical controls on the VM (e.g., restrict removable media, disable unapproved cloud sync). Document the controls and any exceptions (e.g., approved backup destination) with business justification.

### 4.3 Object reuse and memory (VM)

1. **Configuration.** On the Windows VM(s), apply settings that reduce information leakage (e.g., "Interactive logon: Do not display last user name"; secure desktop for logon; clear pagefile at shutdown if required by policy). Document the settings (GPO or local policy) used to support information transfer control and object reuse.

### 4.4 Review and verification

1. **Frequency.** Review NSG rules, Windows Firewall, and transfer-related settings at least annually or after network or VM changes.
2. **Evidence.** Retain dated evidence (screenshot or export) of NSG and firewall configuration and any change records. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/network administrator:** Configure and maintain NSGs, Windows Firewall, and VM settings; document configuration.
- **Security / Compliance:** Verify controls during assessments and ensure alignment with this procedure and the boundary document.
- **Users:** Comply with Rules of Behavior (MAC-FRM-204) and do not transfer CUI to unauthorized systems or devices.

---

## 6. Evidence and Records

- NSG rules (or equivalent) for the subscription/VM; Windows Firewall summary or export.
- Brief narrative of allowed outbound and transfer restrictions.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204)
- Configuration Management Policy (MAC-POL-220)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
