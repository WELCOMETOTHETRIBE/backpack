# Azure/Entra 7-Controls Adjudication Analysis

This document analyzes whether the `validate_azure_entra.py` validator is adjudicating the seven Azure/Entra controls in the right way relative to NIST SP 800-171 Rev. 2 (and CMMC L2). It maps each control’s requirement to what the validator checks, notes alignment or gaps, and suggests improvements where useful.

---

## 1. Control summary (NIST 800-171 Rev. 2 wording)

| Control | Requirement (800-171 §) | What the control actually asks for |
|--------|--------------------------|-------------------------------------|
| **IA.L2-3.5.3** | MFA for privileged accounts | Require MFA for local and network access to **privileged** accounts and for network access to nonprivileged accounts. |
| **IA.L2-3.5.4** | Replay-resistant authentication | Employ **replay-resistant authentication mechanisms** for network access to privileged and nonprivileged accounts. |
| **IA.L2-3.5.5** | Prevent identifier reuse | **Prevent reuse** of identifiers for a defined period. |
| **IA.L2-3.5.6** | Disable identifiers after inactivity | **Disable identifiers** after a defined period of inactivity. |
| **MA.L2-3.7.5** | MFA for nonlocal maintenance | Require MFA for **nonlocal maintenance sessions**. |
| **SC.L2-3.13.10** | Cryptographic key management | **Control and manage** cryptographic keys. |
| **SC.L2-3.13.5** | Implement subnetworks | Implement **subnetworks** for publicly accessible system components that are physically or logically separated from internal networks. |

---

## 2. What the validator does today

- **Five IA/MA checks (3.5.3, 3.5.4, 3.5.5, 3.5.6, MA 3.7.5):**  
  Each passes only if **both**:
  1. **Evidence:** Sign-in and/or Conditional Access (and for 3.5.4–3.5.6, role-assignments) artifacts exist.
  2. **MFA in path:** Either (a) CA policy requires MFA for broad apps **and** sign-in data shows MFA, or (b) Bastion MFA attested, or (c) **signed** MFA-in-path attestation (`mfa-in-path-attested.txt` + `mfa-in-path-attested.sig` with `SIGNED_AT=`).

- **SC.L2-3.13.10 (AZ-KEYVAULT):**  
  Pass when `keyvault-list.json` is non-empty and, when `keyvault-*-properties.json` exists, soft delete and purge protection are enabled for each vault.

- **SC.L2-3.13.5 (AZ-NSG):**  
  Pass when `nsg-list.json` and `nsg-rules-*.json` exist and either (a) no NSG rule effectively allows RDP (3389) from public (0.0.0.0/0, Internet, etc.), or (b) an acceptable alternative is attested (Bastion, JIT, or Firewall).

---

## 3. Per-control adjudication assessment

### IA.L2-3.5.3 — MFA for privileged accounts

- **Requirement:** MFA for **privileged** (and network access for nonprivileged).
- **Validator:** Requires Entra/CA evidence + MFA in enclave access path (evidence or signed attestation). It does **not** check that a CA policy specifically targets **privileged** roles (e.g. Global Admin, VM Admin).
- **Verdict:** **Reasonable for enclave scope.** For the CUI boundary (Azure + enclave VM), “privileged” effectively includes anyone who can access the VM. Requiring MFA on the path to that access (Entra/VPN/Bastion) is the right technical condition. The validator does not verify “this CA policy applies to directory role X”; an assessor would still confirm that privileged accounts are in scope of MFA policies.
- **Optional improvement:** Add a check that at least one CA policy includes a “privileged” condition (e.g. directory role) when CA export is present; or document in the report that “privileged scope must be confirmed from CA policy review.”

---

### IA.L2-3.5.4 — Replay-resistant authentication

- **Requirement:** Replay-resistant authentication mechanisms for network access.
- **Validator:** Same evidence + MFA in path. No explicit “replay-resistant” check (e.g. nonce, token lifetime).
- **Verdict:** **Appropriate.** Entra uses modern auth (OAuth 2.0 / OpenID Connect, short-lived tokens) and MFA; that is the standard way to satisfy replay resistance for network access. The validator’s “Entra evidence + MFA in path” is a reasonable proxy. No change required for adjudication.

---

### IA.L2-3.5.5 — Prevent identifier reuse

- **Requirement:** Prevent reuse of identifiers for a defined period.
- **Validator:** Same as other IA checks — Entra/role evidence + MFA in path. **No check** that identifiers are not reused (no procedure, no directory export of disabled/deleted accounts).
- **Verdict:** **Documentation-led, not validator-led.** The validator does not adjudicate 3.5.5 on its own; it only ensures “Entra is in use and MFA is in path.” The narrative (e.g. `IA_L2_3_5_4_3_5_5_3_5_6_Entra_Implementation_Narrative.md`) states that Entra does not allow UPN/identifier reuse. So **we are not wrongly claiming** 3.5.5 from the validator alone; we are claiming it from “Entra in use + policy/procedure + narrative.” That’s acceptable if the evidence bundle and SSP clearly tie 3.5.5 to Entra lifecycle and procedure (e.g. MAC-SOP-222).
- **Optional improvement:** In the report or evidence index, state explicitly that 3.5.5 and 3.5.6 are satisfied by **Entra capability + policy/procedure**, and that the validator only confirms Entra evidence is present (not reuse/inactivity rules themselves). Or add an optional artifact (e.g. procedure doc reference or “identifier-lifecycle-attested.txt”) so the link is machine-readable.

---

### IA.L2-3.5.6 — Disable identifiers after inactivity

- **Requirement:** Disable identifiers after a defined period of inactivity.
- **Validator:** Same — Entra/role evidence + MFA in path. **No check** for an inactivity period, disablement process, or sign-in-based review.
- **Verdict:** **Same as 3.5.5.** Adjudication relies on narrative and procedure (e.g. “90 days inactivity,” use of sign-in logs or automation). The validator only confirms “Entra is in use”; it does not verify the inactivity policy or that accounts are actually disabled. Acceptable as long as the evidence bundle and SSP document the process and, where applicable, automation (e.g. Entra P1/P2 or separate process). No change required for the validator logic; clarity in documentation is enough.

---

### MA.L2-3.7.5 — MFA for nonlocal maintenance

- **Requirement:** MFA for nonlocal maintenance sessions.
- **Validator:** Same MFA-in-path + evidence. For the enclave, nonlocal maintenance = RDP/SSH from outside the VM, so MFA in the path to that access is exactly what the control asks for.
- **Verdict:** **Correct.** The only nuance is that 3.7.5 often expects **records** of remote maintenance sessions; the validator does not collect or check session logs. That remains an evidence-bundle/runbook concern (e.g. MAC-SOP-224, session logs). The validator’s role — “MFA required on the path to maintenance access” — is appropriate.

---

### SC.L2-3.13.10 — Cryptographic key management

- **Requirement:** Control and manage cryptographic keys.
- **Validator:** Key Vault list non-empty; when properties are exported, soft delete and purge protection enabled.
- **Verdict:** **Right approach.** The validator confirms that a key-management capability exists (Key Vault) and that basic safeguards are on. It does not verify key rotation, access policies in detail, or key lifecycle; those belong in narrative and optional evidence (e.g. keyvault-*-access-policies.json, procedures). No change needed for adjudication.

---

### SC.L2-3.13.5 — Implement subnetworks

- **Requirement:** Subnetworks for publicly accessible components, physically or logically separated from internal networks.
- **Validator:** NSG list and rules present; RDP not allowed from public, or Bastion/JIT/Firewall attested.
- **Verdict:** **Right approach.** The validator targets the main risk (no open RDP to the internet) and allows attested alternatives. It does not verify VNet/subnet design or “physical/logical separation” in full; that’s architecture and SSP. Adjudication is appropriate for the evidence the validator can see.

---

## 4. Cross-cutting: “MFA in path” for all five IA/MA checks

- **Rationale:** All five controls (3.5.3, 3.5.4, 3.5.5, 3.5.6, 3.7.5) are tied to the **enclave access path**. If someone can reach the VM without going through Entra (e.g. direct RDP with local account only), then:
  - 3.5.3 / 3.7.5: MFA is not required for that path.
  - 3.5.4: Replay-resistant auth may not apply to that path.
  - 3.5.5 / 3.5.6: Identity for that path is local, not Entra; Entra evidence does not fully speak to that path.

- So requiring “MFA in path” (evidence or signed attestation) for all five is **correct**: it ensures we only pass when the path we’re evidencing (Entra, CA, sign-in) is actually the path used for access. The signed attestation is a necessary stand-in when we can’t prove it from CA/sign-in alone.

- **Conclusion:** Using the same “evidence + MFA in path” condition for all five is the right way to adjudicate for the Azure/enclave boundary.

---

## 5. Recommendations

| Priority | Recommendation |
|----------|----------------|
| **Keep** | Current logic for SC.L2-3.13.10 and SC.L2-3.13.5; current “evidence + MFA in path” for 3.5.3, 3.5.4, 3.7.5. |
| **Keep** | Using the same MFA-in-path condition for 3.5.5 and 3.5.6, with the understanding that **identifier reuse and inactivity** are satisfied by **Entra + policy/procedure**, not by the validator alone. |
| **Document** | In the validation report or evidence index: for IA.L2-3.5.5 and IA.L2-3.5.6, state that “Control is satisfied by Entra identity lifecycle and organizational procedure; validator confirms Entra evidence is present.” |
| **Optional** | For 3.5.3, add a note or optional check that assessors should confirm from CA policy that **privileged** accounts are in scope for MFA. |
| **Optional** | Add an optional artifact (e.g. `identifier-lifecycle-procedure-ref.txt` or reference in manifest) linking 3.5.5/3.5.6 to MAC-SOP-222 or equivalent, so the evidence bundle is self-describing. |

---

## 6. Summary

- **SC.L2-3.13.10 and SC.L2-3.13.5:** Validator adjudication is appropriate; evidence and checks align with the control objectives.
- **IA.L2-3.5.3, 3.5.4, MA.L2-3.7.5:** Same; “evidence + MFA in path” is the right way to adjudicate for the enclave.
- **IA.L2-3.5.5 and 3.5.6:** Validator correctly ensures Entra (and MFA) is in the path; the actual “prevent reuse” and “disable after inactivity” claims depend on **Entra capability + policy/procedure**, which should be clearly stated in documentation and evidence so we are not over-claiming from the validator alone.

Overall, we are adjudicating the seven controls in the right way for the Azure/Entra/enclave boundary, with the main nuance that 3.5.5 and 3.5.6 are partially documentation-led; making that explicit keeps the adjudication defensible.
