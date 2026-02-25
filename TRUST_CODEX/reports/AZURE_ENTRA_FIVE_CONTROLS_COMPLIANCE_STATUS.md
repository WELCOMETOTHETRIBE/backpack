# Azure/Entra five controls — compliance status and hardening

**Purpose:** Assessment-ready status for the five Azure/Entra-dependent controls. This memo reflects **hardening first**: documentation and configuration have been added; remaining gaps are explicitly documented with POA&M where needed.

**Controls in scope:** IA.L2-3.5.4, IA.L2-3.5.5, IA.L2-3.5.6, SC.L2-3.13.10, SC.L2-3.13.5. **Also relevant:** IA.L2-3.5.3 (MFA), MA.L2-3.7.5 (MFA for nonlocal maintenance).

**Reference:** NIST SP 800-171 Rev.2; Evidence Index `tables/EVIDENCE_INDEX.md`; CLASS_A_IMPLEMENTATION_PLAN.

---

## 0. Validator vs. control satisfaction (important)

**The Azure/Entra validator only checks that evidence *artifacts* are present** (e.g. `conditional-access-policies.json`, `role-assignments-all.json`, `keyvault-list.json`, NSG rules). It does **not** verify that MFA or Entra is actually in your **access path**.

**Current access path:** SSH (key-based) and RDP (local Windows account) to the enclave VM. **Neither path goes through Entra ID**, so there is **no MFA** at login for those sessions. Therefore:

- **IA.L2-3.5.3** (MFA for privileged accounts) — **Not satisfied** (MFA not in path).
- **IA.L2-3.5.4** (Replay-resistant authentication) — **Not satisfied** for this path (no Entra/MFA at SSH or RDP).
- **IA.L2-3.5.5** (Prevent identifier reuse) — Entra can satisfy this, but your VM logons use local/SSH identities; **partially satisfied** only if you treat Entra as source of truth for *who* has access (e.g. RBAC for VM login).
- **IA.L2-3.5.6** (Disable identifiers after inactivity) — Same as above; **not fully satisfied** for local/SSH accounts without a separate process to disable them.
- **MA.L2-3.7.5** (MFA for nonlocal maintenance) — **Not satisfied** (SSH and RDP are nonlocal maintenance and currently MFA-less).

**SC.L2-3.13.10** and **SC.L2-3.13.5** do not depend on the access path; they remain **satisfied** (Key Vault present, NSG denies public RDP).

**To satisfy the IA/MA MFA and replay-resistant requirements**, MFA must be in the path. Options (see EVIDENCE_RUNBOOK and AZURE_AD_LOGIN_FOR_RDP_SETUP.md):

1. **VPN that requires Entra sign-in** (and MFA) before you can reach the VM; then SSH or RDP with key/local account. MFA happens at VPN.
2. **Azure AD login for RDP** — Install AAD Login extension on the VM, assign “Virtual Machine User Login” (or Admin), sign in to the VM with your Entra account at the RDP screen; Entra (and MFA) run at logon.
3. **Azure Bastion** — RDP through Bastion uses Entra sign-in, so MFA applies there.

Until one of these is in place, **do not claim IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6 or MA.L2-3.7.5 as satisfied**; keep them on POA&M with closure criteria “MFA enforced in enclave access path (VPN + Entra or Azure AD login for RDP).”

---

## 1. Summary table

| Control | Requirement | Current evidence | Status | What was done / what remains |
|---------|-------------|------------------|--------|------------------------------|
| **IA.L2-3.5.3** | MFA privileged accounts | CA export (e.g. empty); role assignments; sign-in often empty | **Not satisfied** | Evidence files can be present (validator PASS), but **MFA not in access path** (SSH key + RDP local). Put MFA in path (VPN+Entra or Azure AD login for RDP); then close. |
| **IA.L2-3.5.4** | Replay-resistant authentication | Same | **Not satisfied** | No Entra/MFA at SSH or RDP. Same as 3.5.3: MFA in path required. |
| **IA.L2-3.5.5** | Prevent identifier reuse | Role assignments; Entra lifecycle | **Partially met** | Entra can enforce; local/SSH accounts need procedure. MFA in path strengthens. |
| **IA.L2-3.5.6** | Disable identifiers after inactivity | Same | **Partially met** | Entra + procedure for inactive accounts; local/SSH need process. MFA in path strengthens. |
| **MA.L2-3.7.5** | MFA for nonlocal maintenance | Same as 3.5.3 | **Not satisfied** | SSH and RDP are nonlocal maintenance; currently MFA-less. Same as 3.5.3: MFA in path required. |
| **SC.L2-3.13.10** | Cryptographic key management | keyvault-list.json; access policy export | **Met** | Key Vault present; narrative and export in place. |
| **SC.L2-3.13.5** | Subnetworks | nsg-list.json; nsg-rules-*; deny 0.0.0.0/0 to 3389 | **Met** | Narrative and evidence defensible. |

---

## 2. What was created (hardening)

- **SC.L2-3.13.5:** `docs/SC_L2_3_13_5_Subnetwork_Implementation_Narrative.md` — subnetwork separation, NSG, evidence location, validator.
- **SC.L2-3.13.10:** `docs/SC_L2_3_13_10_Key_Management_Narrative.md` — Key Vault implementation, key lifecycle, evidence; `tools/export_azure_evidence.sh` extended to export Key Vault access policies and role assignments when Key Vault list is non-empty.
- **IA.L2-3.5.4, 3.5.5, 3.5.6:** `docs/IA_L2_3_5_4_3_5_5_3_5_6_Entra_Implementation_Narrative.md` — how Entra satisfies replay-resistant auth, identifier reuse prevention, disable-after-inactivity; required evidence (CA + sign-in).
- **Runbook:** `docs/EVIDENCE_RUNBOOK.md` — New §2a “Export Conditional Access policies” with portal, Graph, and file placement; §2 and §5a updated to require CA export and sign-in in same run folder for defensibility.

---

## 3. What remains (unmet / POA&M)

- **IA.L2-3.5.3, IA.L2-3.5.4, IA.L2-3.5.5, IA.L2-3.5.6, MA.L2-3.7.5:** **Control not satisfied while access is MFA-less.** Current path: SSH (key) + RDP (local account) with no Entra/MFA. These must remain on POA&M until:
  1. **MFA is in the access path** (choose one): (a) VPN that requires Entra sign-in (and MFA) before SSH/RDP, or (b) Azure AD login for RDP (AAD Login extension + VM Login role, sign in with Entra at RDP), or (c) Azure Bastion for RDP.
  2. Evidence: CA/MFA policy export and (if available) sign-in logs in the run; validator can still PASS on artifacts, but **do not close the POA&M until MFA is actually enforced** for enclave access.
  - **POA&M closure criteria:** “MFA enforced in enclave access path (VPN+Entra or Azure AD login for RDP); evidence run attached.”
- **SC.L2-3.13.10:** No POA&M required; Key Vault and export in place.

---

## 4. References

- Evidence Index: `tables/EVIDENCE_INDEX.md`
- Runbook: `docs/EVIDENCE_RUNBOOK.md` (§2, §2a, §5a)
- Validator: `tools/validate_azure_entra.py`
- POA&M procedure: `governance/.../MAC-SOP-231_POA&M_Process_Procedure.md`
- Manual POA&M tab: add IA.L2-3.5.4, 3.5.5, 3.5.6 to policy POA&M list with suggested tasks and closeout (collect CA + sign-in evidence).
