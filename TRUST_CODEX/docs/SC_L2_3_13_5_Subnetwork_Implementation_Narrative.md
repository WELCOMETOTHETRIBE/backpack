# SC.L2-3.13.5 — Implement subnetworks for publicly accessible system components

**Control:** NIST SP 800-171 Rev.2 § 3.13.5 — Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.

**Document purpose:** Implementation narrative and evidence reference for CMMC Level 2 / 800-171 assessment. This document supports hardening and compliance by describing how the pilot implements subnetwork separation and where evidence is stored.

---

## 1. Implementation summary

The CUI pilot uses **Azure Virtual Network (VNet)** and **Network Security Groups (NSGs)** to separate and restrict access to the enclave. Administrative access is **VPN + RDP** (or SSH for operations); RDP from the public internet is explicitly **denied** by NSG rules. There is no “publicly accessible” RDP surface; the design keeps CUI workload components on internal subnets with NSG enforcement.

---

## 2. Architecture (subnetwork separation)

- **Subscription / resource group:** Enclave resources (VM, Key Vault, NSG) are in a dedicated resource group (e.g. `rg-cui-pilot-envclave`).
- **VNet and subnets:** The Windows VM (and any future CUI workloads) are deployed in Azure VNet subnets. The NSG attached to the VM’s subnet (e.g. `nsg-cui-pilot`) enforces which traffic is allowed or denied.
- **Public vs internal:**
  - **No public RDP:** An NSG rule with **higher priority** (e.g. 100) **denies** inbound TCP 3389 from `0.0.0.0/0`. Any lower-priority “allow” rule (e.g. default-allow-rdp at 1000) does not override this for general internet traffic, so RDP is not exposed to the public internet.
  - **Controlled access:** SSH (or RDP, if explicitly allowed from a specific source) is limited by rules that specify source prefixes (e.g. VPN or jump host IP), not 0.0.0.0/0.
- **Result:** “Publicly accessible system components” (e.g. internet-facing endpoints) are physically or logically separated from the internal enclave; the enclave is reached only via controlled paths (VPN + RDP/SSH from allowed sources).

---

## 3. Evidence and validation

| Evidence type | Location / artifact | Use |
|---------------|---------------------|-----|
| NSG list | `evidence/runs/<RunId>/raw/azure/nsg-list.json`, `nsg-list.txt` | Shows NSGs in scope (e.g. `nsg-cui-pilot`). |
| NSG rules | `evidence/runs/<RunId>/raw/azure/nsg-rules-<nsg-name>.json` (e.g. `nsg-rules-nsg-cui-pilot.json`) | Shows deny rule for RDP from 0.0.0.0/0 (priority 100) and other rules. |
| Validator | `validate_azure_entra.py` (SC.L2-3.13.5 / AZ-NSG-RDP check) | PASS when an NSG has a rule denying 0.0.0.0/0 to port 3389 with higher priority than any allow. |

**Example rule (from pilot):** Rule name `Deny-RDP-From-Public-Codex`, priority **100**, direction Inbound, **Deny**, source `0.0.0.0/0`, destination port **3389**, protocol Tcp. Lower-priority allow rules do not open RDP to the public.

---

## 4. Regeneration and cadence

- **Collect:** Run `TRUST_CODEX/tools/export_azure_evidence.sh` with `AZURE_RG` set (or equivalent Azure/Entra collect script). Produces `nsg-list.json` and `nsg-rules-<nsg>.json` in the run’s `raw/azure/` directory.
- **Validate:** Run `TRUST_CODEX/tools/validate_azure_entra.py --artifact-dir <raw/azure path>`; confirm SC.L2-3.13.5 (AZ-NSG-RDP) PASS.
- **Cadence:** Monthly and per network/NSG change (see Evidence Index).

---

## 5. References

- **Evidence Index:** `tables/EVIDENCE_INDEX.md` — SC.L2-3.13.5 row (VNet/NSG exports).
- **Runbook:** `docs/EVIDENCE_RUNBOOK.md` §4 (NSG/network rules), §5a (Azure/Entra 7-control module).
- **Validator:** `tools/validate_azure_entra.py` (AZ-NSG-RDP, SC.L2-3.13.5).
- **Architecture:** `governance/.../MAC-IT-306_CUI_Vault_Architecture_Diagram.md` (tailor for Azure VNet/NSG in pilot).
