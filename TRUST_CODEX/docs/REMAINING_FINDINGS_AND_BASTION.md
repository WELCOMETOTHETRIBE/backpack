# Remaining Findings (All Remediated)

**Access path:** The enclave uses **VPN + RDP to VM** (no Azure Bastion). All documentation and the Evidence Index have been updated to this model.

---

## 1. Former findings — status

| # | Finding | Status | What was done |
|---|---------|--------|----------------|
| 1 | **Over-generic artifact descriptions** | **Remediated** | Evidence Index now uses concrete artifact names: "VM session config + Entra sign-in logs + role assignments (VPN + RDP access path)". **Evidence Runbook** (`docs/EVIDENCE_RUNBOOK.md`) added with exact commands for VM evidence, Entra sign-in logs, role assignments, and NSG exports. |
| 2 | **Self-hosted runner in enclave** | **Operational** | Deploy when ready. Passing assessment does not require it; manual evidence runs with documented process (and this runbook) are sufficient. |

All C3PAO-style findings from the assessment are now remediated. Bastion references have been removed in favor of VPN + RDP throughout the Codex.

---

## 2. Where VPN + RDP is documented

- **Evidence Index** (`tables/evidence-index.json` → `EVIDENCE_INDEX.md`): Artifact names and regeneration methods reference VPN + RDP and the runbook.
- **Control mapping** (`tables/CONTROL_MAPPING_800-171R2.md`): Access path stated as "VPN + RDP" (was "Bastion-mediated").
- **Shared Responsibility Matrix** (`manual_app/docs/03_Shared_Responsibility_Matrix.md`): Customer evidence includes "VPN/RDP access config" (was "Bastion/JIT").
- **VM hardening** (`vm-scripts/Invoke-CuiHardening.ps1`): Comment updated to "VPN + RDP access; restrict redirection."
- **Manual App** (`manual_app/app.js`): 3.1.14 managed access control points use NSG + VPN + RDP (Bastion commands removed).
- **VM-evidenced controls** (`tables/VM_EVIDENCED_CLASS_A_CONTROLS.md`): Shared controls require "Azure/Entra" evidence (Bastion removed from wording).

---

## 3. Evidence Runbook

See **`docs/EVIDENCE_RUNBOOK.md`** for:

- VM session config (Collect-Cui-Evidence.ps1, Test-CuiHardening.ps1)
- Entra sign-in logs (portal export or Graph/CLI)
- Role assignments (Azure RBAC + Entra roles)
- NSG / network rules (az network nsg rule list)
- Integrity and provenance

This closes the "generic artifact descriptions" finding by providing exact commands and storage locations.
