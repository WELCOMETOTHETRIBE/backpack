# System Owner Guide — Conclusive Reference

**Audience:** System Owner (Attestee) for the CUI Pilot System.  
**Purpose:** Single, conclusive document so you know exactly what you need to know: your accountability, the system boundary, where the truth lives, what requires your decision, and where to point assessors and your team.

This guide is the **authoritative System Owner reference** for the Trust Codex. Everything below is applicable to your role.

---

## 1. Your role and accountability

| You (System Owner) are accountable for | You delegate (but oversee) |
|----------------------------------------|----------------------------|
| **System boundary** — what is in scope and what is out of scope for the CUI enclave | **ISSO** — control design, evidence strategy, assessment readiness |
| **Risk acceptance decisions** — accepting residual risk when controls are partial or deferred | **IT Administrator** — day-to-day technical operation and evidence generation (VM, Entra, NSG) |
| **Attestation** — you are the **Attestee**; SRM review and material-change sign-off are yours | **Compliance Officer** — governance artifacts, training records, policy/SOP recordkeeping |

- **Shared Responsibility Matrix (SRM):** Must be **signed by you** (initial, annual, and per material change). It defines provider vs customer responsibility and required evidence. Location: `manual_app/docs/03_Shared_Responsibility_Matrix.md`.
- This system is **not** pre-validated; the **system owner/customer is the Attestee**. You own the representation to assessors.

---

## 2. The system in one place

| Item | Pilot default |
|------|----------------|
| **What it is** | Contained CUI enclave (Windows Server 2025 Datacenter in Microsoft Azure). CUI only within enclave boundary. |
| **Framework** | CMMC Level 2, assessed against **NIST SP 800-171 Rev.2** (110 requirements). Rev.3 is reference only. |
| **Identity** | Microsoft Entra ID (cloud-only); Entra-joined VMs. |
| **Administrative access** | **VPN + RDP** to enclave VM. No public RDP. |
| **Evidence retention** | 1 year (pilot baseline) for technical and governance evidence. |
| **Control strategy** | **Class A** (~90): system-enforced, technically evidenced. **Class B** (~20): governance, inherited, or N/A with justification. |

**In scope:** Enclave compute/OS, Entra identity, VPN+RDP access, Azure VNet segmentation, centralized logging (1-year baseline).  
**Out of scope:** Unmanaged endpoints, removable media, customer-facing application layer (in pilot).

---

## 3. Single source of truth (no drift)

| What | Where | Rule |
|------|--------|------|
| **Control status and basis** | `tables/SCTM_FULL_STATUS_LIST.csv` | **This is the only source of truth** for whether a control is Implemented, Governed, N/A, Planned, or Inherited. |
| **Human-readable closeout** | `tables/CONTROL_CLOSEOUT_FROM_SCTM.md` | Generated from SCTM in CI. Do **not** use hand-maintained closeout narratives for status. |
| **Technical pass/fail (VM)** | `validation-report.json` (per run) | Validator output; required checks must pass before claiming Implemented for VM-evidenced controls. |

**You must ensure:** No one uses deprecated status docs (e.g. `WINDOWS_EVIDENCE_CLOSEOUT.md`) for control status. SCTM wins.  
**Validator rule:** Do **not** claim a control as **Implemented (Evidenced on Pilot VM)** if `validation-report.json` shows failed required checks for that control. See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`.

---

## 4. Where evidence lives and who produces it

| Evidence type | Where it lives | Who produces it |
|---------------|----------------|-----------------|
| **Per-control bundle (assessor handoff)** | `\\EvidenceVault\CUI-Enclave\controls\<ControlId>\<RunId>\bundle.zip` | IT Admin (sync + packager); layout in `vault/VAULT_LAYOUT.md`. |
| **What evidence is required per control** | `tables/EVIDENCE_INDEX.md` (generated from `tables/evidence-index.json`) | Index is canonical; EVIDENCE_INDEX.md is generated in CI. |
| **How to regenerate evidence** | Evidence Index “Regeneration method” column + **`docs/EVIDENCE_RUNBOOK.md`** | Runbook has exact commands: VM (Collect-Cui-Evidence.ps1, Test-CuiHardening.ps1), Entra sign-in logs, role assignments, NSG. |
| **Governance (Class B) records** | `\\EvidenceVault\CUI-Enclave\governance\<ControlId>\<YYYY>\` | Compliance Officer / ISSO; requirements in `tables/CLASS_B_EVIDENCE_OPERATIONS.md`. |
| **Run artifacts before vault** | `C:\evidence\` on evidence host | IT Admin; then sync with `vault/Sync-EvidenceToVault.ps1`. |

If the vault is not yet deployed, evidence can be generated per the runbook and synced when the vault is available. Per-control zips can be built with `tools/package_control_evidence.py`.

---

## 5. What requires your decision or sign-off

| Trigger | Your action |
|---------|-------------|
| **SRM review** | Sign (initial, annual, per material change). SRM defines provider vs customer and evidence expectations. |
| **Boundary or scope change** | Approve boundary statement changes; N/A justifications may need your acknowledgment (see Evidence Index for AC.L2-3.1.16/17, MA, PE, SC N/A controls). |
| **Risk acceptance** | When a control is Planned/Partial or deferred, document risk acceptance per your process. |
| **Material change to system** | Ensure security impact analysis, evidence regeneration, and mapping/index updates; re-sign SRM if material. |

---

## 6. Change triggers (when to regenerate evidence and update mapping)

Treat these as **significant changes** (security impact analysis, evidence regeneration, mapping/index updates as needed):

- Identity policy changes (MFA, conditional access, privileged roles)
- Network access path changes (VPN/RDP config, segmentation, NSGs)
- Logging pipeline changes (sources, retention, destinations)
- Cryptography configuration changes (FIPS, TLS)
- Any new data ingress/egress mechanism for CUI

---

## 7. Incidents and escalation

| Severity | Reporting baseline |
|----------|--------------------|
| **Critical** | ≤1 hour |
| **High** | ≤4 hours |
| **Medium/Low** | Next business day |

If a control degrades or fails: log and escalate per above; apply compensating controls where possible; create POA&M item if not immediately corrected; update evidence and mapping to reflect current state (no “papering over”).

---

## 8. What assessors see first

- **Give assessors:** `docs/C3PAO_READINESS.md` — one-page authoritative sources and where to find evidence (<2 minutes per control).
- **Authoritative control set:** NIST SP 800-171 Rev.2 (CMMC L2).  
- **Evidence location:** Vault `\\EvidenceVault\CUI-Enclave\...`; layout in `vault/VAULT_LAYOUT.md`; runbook in `docs/EVIDENCE_RUNBOOK.md`.

You do not need to memorize the Codex; you need to know that **status = SCTM**, **evidence = vault + runbook + Evidence Index**, and **attestation = you**.

---

## 9. Key documents (quick lookup)

| Document | What you use it for |
|----------|---------------------|
| **`tables/SCTM_FULL_STATUS_LIST.csv`** | Authoritative control status and basis. |
| **`tables/CONTROL_CLOSEOUT_FROM_SCTM.md`** | Generated closeout table from SCTM. |
| **`tables/EVIDENCE_INDEX.md`** | What evidence is required per control; owner; cadence; regeneration. |
| **`vault/VAULT_LAYOUT.md`** | Where evidence is stored; references runbook and Class B operations. |
| **`docs/EVIDENCE_RUNBOOK.md`** | Exact commands for VM, Entra, role assignments, NSG, integrity. |
| **`docs/C3PAO_READINESS.md`** | Hand to assessors; single entry point for evidence and authority. |
| **`docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`** | Validator-vs-claim rule; RDP/inactivity checks. |
| **`manual_app/docs/03_Shared_Responsibility_Matrix.md`** | Provider vs customer; your sign-off. |
| **`tables/CLASS_B_EVIDENCE_OPERATIONS.md`** | Class B records, templates, cadence, vault paths. |
| **`chapters/02_CUI_Boundary_and_Data_Handling.md`** | Canonical boundary and data handling (in-scope, out-of-scope). |
| **`chapters/20_Operational_Guardrails.md`** | Roles, change triggers, retention, incidents. |

---

## 10. Explicit non-claims (assessment-safe)

- We do **not** claim certification.
- We do **not** claim all 110 requirements are “technically enforced” today; status is in SCTM (Implemented, Governed, N/A, Planned, Inherited).
- We do **not** treat policy text alone as technical evidence; evidence is in the vault and runbook.

---

## Summary

As System Owner you are responsible for: **boundary and risk acceptance**, **attestation (SRM sign-off)**, and ensuring **one source of truth (SCTM)** and **evidence that matches it** (vault + runbook + Evidence Index). Use this document as your conclusive reference; point your team and assessors to the documents in section 9 and to `docs/C3PAO_READINESS.md` for evidence location and authority.
