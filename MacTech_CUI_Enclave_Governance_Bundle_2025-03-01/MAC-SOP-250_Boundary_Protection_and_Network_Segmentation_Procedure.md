# Boundary Protection and Network Segmentation Procedure

**Document ID:** MAC-SOP-250  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.13.1 (Boundary protection); SC.L2-3.13.5 (Network segmentation); SC.L2-3.13.6 (Deny-by-default); SC.L2-3.13.7 (Prevent split tunneling)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave monitors, controls, and protects communications at the external and key internal boundaries of the system, implements network segmentation and deny-by-default rules, and prevents split tunneling that could bypass boundary controls. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Network security groups (NSGs) and firewall rules at the Azure subscription and VM level; segmentation between user traffic and management traffic; deny-by-default, permit-by-exception; prevention of split tunneling for remote access to the enclave; documentation of boundary and segmentation design.
- **Out of scope:** Network design outside the Azure Government subscription; user device configuration beyond VPN/access path to the enclave (addressed by policy and MAC-SOP-224 where applicable).

---

## 3. Prerequisites

- System and Communications Protection Policy (MAC-POL-225); administrative access to Azure Government and Windows VM(s) to document and verify NSGs and firewall configuration; VPN configuration that supports enforcement of no split tunneling for enclave access.

---

## 4. Procedure

### 4.1 Monitor and protect communications at the boundary

1. **External boundary.** The external boundary of the enclave is the Azure Government subscription perimeter (internet-facing) and the VPN/Entra access path. Ensure that:
   - The Windows VM(s) are not directly exposed to the public internet.
   - All user access to the VM(s) is through MacTech’s VPN and Entra ID (or approved management path such as Azure Bastion).
   - Inbound and outbound traffic at the boundary is monitored and controlled (e.g., NSGs, Azure Firewall if used).
2. **Internal boundaries.** Segment key internal boundaries (e.g., management subnet vs. workload subnet; jump host or Bastion for admin access). Document the segmentation and which traffic is allowed between segments.

### 4.2 Network segmentation

1. **Segmentation design.** Implement or document network segmentation so that:
   - User RDP/session traffic to the Windows VM(s) is separated from direct internet access from the VM(s).
   - Management traffic (e.g., Bastion, Azure management) uses dedicated paths or segments where feasible.
   - CUI traffic remains within the enclave; no routing of CUI to non-enclave networks.
2. **Documentation.** Maintain a diagram or narrative of the network segmentation (subnets, NSGs, allowed flows). Update when the design changes.

### 4.3 Deny-by-default and permit-by-exception

1. **NSGs and firewall.** Configure NSGs (and Windows Firewall on the VM(s)) with deny-by-default: block all inbound and outbound traffic unless explicitly permitted. Document each allowed rule with business justification (e.g., RDP from VPN gateway, Windows Update endpoints).
2. **Review.** Review NSG and firewall rules at least annually or after network or VM changes; remove obsolete rules; retain export or screenshot for evidence.

### 4.4 Prevent split tunneling (remote access)

1. **Requirement.** When users access the CUI enclave via VPN, prevent split tunneling so that enclave-bound traffic cannot bypass the VPN (and thus the boundary controls). Configure the VPN client or gateway so that traffic to enclave resources is forced through the VPN; document the configuration.
2. **User devices.** Policy and user agreement (MAC-FRM-204) shall require use of the organization’s VPN for enclave access and prohibit configuration that would send enclave traffic over non-VPN paths. Where technical enforcement is on the client, document the control (e.g., VPN profile that enforces no split tunnel for enclave destinations).

### 4.5 Alignment with information transfer controls

1. **Consistency.** Boundary and segmentation controls shall align with Procedures for Information Transfer Controls (MAC-SOP-244): no unauthorized transfer of CUI outside the boundary; outbound restrictions to prevent exfiltration. Cross-reference NSG/firewall rules with MAC-SOP-244 documentation.

### 4.6 Review and verification

1. **Frequency.** Review boundary protection, segmentation, and split-tunnel controls at least annually or after any change.
2. **Evidence.** Retain NSG and firewall rule exports or screenshots; network diagram; VPN configuration summary. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/network administrator:** Configure and maintain NSGs, firewall, VPN, and segmentation; document design and rules.
- **Security / Compliance:** Verify controls during assessments; ensure alignment with MAC-POL-225 and MAC-SOP-244.
- **Users:** Use only approved VPN and access path; do not configure split tunneling for enclave access.

---

## 6. Evidence and Records

- NSG and firewall rule documentation (export or screenshot); network segmentation diagram or narrative.
- VPN configuration (no split tunneling for enclave); review and change records.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- System and Communications Protection Policy (MAC-POL-225)
- Procedures for Information Transfer Controls (MAC-SOP-244)
- Procedures for Remote Access (MAC-SOP-224)
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
