# System Inventory and Asset Management Procedure

**Document ID:** MAC-SOP-252  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.4.2 (Configuration change control — baseline and inventory)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave maintains an inventory of in-scope systems and assets (configuration items) and updates the inventory when assets are added, removed, or changed, in support of configuration change control and the system boundary. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Inventory of systems and assets that process, store, or transmit CUI within the enclave (e.g., Windows VM(s), key Azure resources such as subscription, resource groups, storage, Key Vault, VPN/Bastion); configuration items that affect security (e.g., OS baseline, network configuration); process for adding, removing, and updating inventory when changes occur.
- **Out of scope:** Assets outside the CUI enclave boundary; user work computers (addressed by policy for enclave access only).

---

## 3. Prerequisites

- Configuration Management Policy (MAC-POL-220) and Configuration Change Awareness Procedure (MAC-SOP-225); access to Azure Government and VM(s) to document resources; defined format for the inventory (e.g., spreadsheet, CMDB, or document).

---

## 4. Procedure

### 4.1 Inventory content

1. **Systems and assets.** Maintain an inventory that includes at least:
   - **Windows VM(s):** Name, resource ID, OS version, role (e.g., CUI workload), network location (subnet, NSG).
   - **Azure resources:** Subscription, resource groups, storage accounts, Key Vault(s), networking (VNet, subnets, NSGs), VPN gateway or Bastion if used.
   - **Key configuration items:** Baseline or image used for VM(s); critical configuration that affects security (document or reference to baseline).
2. **Uniquely identifiable.** Each inventory item shall be uniquely identifiable (e.g., Azure resource ID, hostname, asset tag or logical name). Include ownership or responsible role where applicable.

### 4.2 Adding assets

1. **New systems or resources.** When a new system or Azure resource is added to the enclave (e.g., new VM, new storage account), add it to the inventory before or at the time it is placed into production. Document name, type, purpose, and any security-relevant configuration. Follow Configuration Change Awareness (MAC-SOP-225) and obtain approval per MAC-POL-220 where required.
2. **Baseline.** New systems shall be built from an approved baseline (per Configuration Baseline Management and MAC-POL-220). Record the baseline or image used in the inventory or change record.

### 4.3 Removing or decommissioning assets

1. **Decommissioning.** When a system or resource is removed from the enclave, update the inventory to reflect removal (e.g., mark as decommissioned, date removed). Before removal, complete Media Sanitization (MAC-SOP-246) for any storage that held CUI.
2. **Records.** Retain a record of decommissioned assets (name, date removed, sanitization confirmation) per Records Retention Policy.

### 4.4 Updating the inventory

1. **Changes.** When configuration or assets change (e.g., VM resize, new disk, NSG change), update the inventory or linked change record so the inventory remains accurate. Tie updates to change control (MAC-SOP-225) so that changes are approved and documented.
2. **Frequency.** Review the full inventory at least annually; correct any gaps or errors. Retain previous versions or change history where needed for compliance.

### 4.5 Alignment with change control

1. **Single process.** Inventory updates shall be part of or triggered by the configuration change process (MAC-SOP-225, MAC-POL-220). No addition or removal of in-scope assets without going through change control and inventory update.

### 4.6 Evidence and records

1. **Evidence.** Retain the current inventory and, where applicable, change records that show when items were added or removed. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **System/asset owner or administrator:** Maintain the inventory; add, remove, and update entries when changes occur; ensure change control is followed.
- **Security / Compliance:** Verify inventory accuracy during assessments; ensure alignment with MAC-POL-220 and MAC-SOP-225.
- **Change control:** Ensure inventory is updated as part of approved changes (MAC-SOP-225).

---

## 6. Evidence and Records

- System and asset inventory (current); inventory review and update records.
- Link to change records (MAC-SOP-225) for additions, removals, and significant changes.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Configuration Management Policy (MAC-POL-220)
- Configuration Change Awareness Procedure (MAC-SOP-225)
- Configuration Baseline Management Procedure (MAC-SOP-228)
- Procedures for Media Sanitization (MAC-SOP-246)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
