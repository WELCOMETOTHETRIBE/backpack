# Procedures for CUI Media Handling and Transport

**Document ID:** MAC-SOP-247  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.8.4 (Media access); SC.L2-3.8.5 (Media markup); SC.L2-3.8.6 (Media transport)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave controls access to, marking of, and transport of media that contain or have contained CUI, and how devices that process CUI are handled when moved. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Access control and accountability for media that store or have stored CUI within the enclave (e.g., Azure disks, backup storage); marking and handling of such media; transport of media or CUI-bearing devices (including courier, transfer between locations, and decommissioning); chain of custody where applicable.
- **Out of scope:** Media and transport outside the Azure Government subscription; user work computers used only to access the enclave (governed by policy and MAC-FRM-204).

---

## 3. Prerequisites

- Media Handling & Data Disposal Policy (MAC-POL-213) and CUI Marking & Handling Procedure (MAC-SOP-248) or equivalent.
- Defined list of authorized personnel who may handle or transport CUI media; secure transport or courier requirements when physical transport is used.

---

## 4. Procedure

### 4.1 Media access control

1. **Limit access.** Only authorized personnel (as defined in MAC-POL-213 and access control procedures) may access media that contain or have contained CUI. Access to Azure storage (disks, backups) is restricted via Azure RBAC and subscription controls; document who has access and review periodically.
2. **Accountability.** Log access to or handling of CUI media where feasible (e.g., Azure activity logs for storage operations). For physical media, maintain a handling log. Retain per Records Retention Policy.

### 4.2 Media marking and identification

1. **Logical identification.** Within the enclave, CUI data stores (e.g., Azure resources, backup containers) shall be identified or labeled so that handlers and administrators know they contain CUI. Use resource tags, naming conventions, or documentation as appropriate.
2. **Physical media.** If physical media (e.g., backup tapes, drives) are used, mark them with CUI designation per MAC-SOP-248 and handle only in controlled areas. Per MAC-POL-213, the enclave does not use removable media for CUI storage; this step applies only if an exception is approved.

### 4.3 Media transport

1. **Within Azure / logical transport.** Data movement within the Azure Government subscription (e.g., replication, backup) is controlled by Azure and MacTech’s configuration. Ensure only authorized replication and backup paths are used; document allowed data flows. No CUI shall be transferred to regions or tenants outside the approved boundary.
2. **Physical transport.** If CUI media or CUI-bearing equipment must be physically transported (e.g., disk shipment, equipment move), use secure courier or hand-to-hand transfer with receipt; limit to authorized personnel; protect from unauthorized access and environmental damage. Document chain of custody (sender, receiver, date, method). Minimize physical transport; prefer logical transfer within the boundary.
3. **No unauthorized transport.** Policy and training (MAC-FRM-204) prohibit personnel from carrying CUI on removable media, personal devices, or unapproved transport. Enforcement is through policy, training, and technical controls (e.g., no removable media for CUI on the Windows VM(s)).

### 4.4 Review and verification

1. **Frequency.** Review media access, marking, and transport practices at least annually or after any incident or boundary change.
2. **Evidence.** Retain logs of media handling and transport, and documentation of access controls. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/asset owner or administrator:** Control access to CUI media; apply marking/identification; ensure secure transport when required; document actions.
- **Security / Compliance:** Verify controls during assessments and ensure alignment with this procedure and MAC-POL-213.
- **Users:** Do not transport CUI on removable media or personal devices; report any required transport to designated personnel.

---

## 6. Evidence and Records

- Documentation of who has access to CUI media (Azure/storage); activity or handling logs.
- Resource tags or naming documenting CUI designation; chain-of-custody records for physical transport.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Media Handling & Data Disposal Policy (MAC-POL-213)
- CUI Marking and Handling Procedure (MAC-SOP-248)
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
