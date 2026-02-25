# C3PAO Readiness — Where to Find Evidence and Authoritative Sources

This one-pager tells assessors and internal teams exactly what is authoritative and where to find evidence so you can pass a CMMC L2 (C3PAO) assessment without contradiction or confusion.

**Representative submission (no overclaims):** Control status in this Codex is intended to be representative of actual implementation and evidence. We do not claim "Implemented" for VM-evidenced controls unless the validation run shows all required checks PASS; we use "Governed (Docs Present; Records Pending)" where policies exist but operational records are not yet attached. Pre-submission hardening and checklist: `docs/PRE_SUBMISSION_REMEDIATION_AND_HARDENING.md`.

---

## Hand to C3PAO auditor (single deliverable)

**Provide this single file:** `TRUST_CODEX/_build/CODEX_VIEWER.html`

If the viewer shows "Unterminated string in JSON", the embedded payload was truncated or corrupted. Rebuild it from source: from repo root run `python3 TRUST_CODEX/tools/build_codex_viewer.py`, then optionally `python3 TRUST_CODEX/tools/refresh_codex_viewer_evidence_index.py`.

It is an **offline, self-contained** HTML viewer that embeds the full Trust Codex. The auditor can open it in a browser (no server or repo access required) and has everything needed to adjudicate:

| In the viewer | Purpose |
|---------------|--------|
| **Chapters** | Executive foreword, system purpose, CUI boundary, control philosophy, system-enforced controls by family, governance/NA controls, operational guardrails, **Assessor Readiness Playbook**, VM hardening & evidence ops, gaps/POA&M |
| **Evidence Index** | `tables/EVIDENCE_INDEX.md` — evidence type, artifact, owner, location, retention, cadence, regeneration method per control |
| **Control mapping** | `tables/CONTROL_MAPPING_800-171R2.md` — 110 requirements mapping |
| **SCTM** | SCTM GUI and `sctm-data.json` — control status, implementation notes, evidence plans |
| **Status / closeout** | `CURRENT_SATISFACTION_ROLLUP.md`, `CLASS_A_NOT_IMPLEMENTED_CLOSEOUT_PLAN.md` |
| **VM evidence** | `vm-scripts/README.md` — collector and hardening scripts |

**Where to run the refresh script:** From your machine (MacBook or wherever the repo lives), in a terminal at the **repo root** (`cui-pilot`):
```bash
cd /path/to/cui-pilot
python3 TRUST_CODEX/tools/refresh_codex_viewer_evidence_index.py
```
That updates the embedded Evidence Index inside `_build/CODEX_VIEWER.html` on disk. No server or VM required.

**If the viewer opens blank:** Some browsers restrict `file://` pages. Serve the file locally instead:
```bash
cd TRUST_CODEX/_build
python3 -m http.server 8080
```
Then open **http://localhost:8080/CODEX_VIEWER.html** in the browser. If the viewer still shows an error, the page will display the message and the same server instructions.

**Evidence on the VM (for assessor viewing on the enclave):** Use **`C:\evidence\`** on the VM. The auditor opens the latest `CUI-Evidence-<RunId>` folder for artifacts and `CUI-Validation-<RunId>` for the validation report. Copy `vm-scripts/README-for-auditor.txt` to `C:\evidence\README-for-auditor.txt` on the VM; optionally copy `_build/CODEX_VIEWER.html` to `C:\evidence\` so the auditor can open the Codex in a browser there. See **`docs/AUDITOR_VIEW_ON_VM.md`**.

This one-pager (`docs/C3PAO_READINESS.md`) is the assessor entry point for *where* evidence lives in the vault and how status is defined; it can be provided alongside the viewer or printed.

---

## 1. Authoritative control set

- **CMMC Level 2 is assessed against NIST SP 800-171 Rev.2.**
- NIST SP 800-171 Rev.3 is used in this Codex for explanatory and forward-looking reference only; it is not the assessed requirement set.

---

## 2. Authoritative control status (no drift)

| What | Where | Notes |
|------|--------|------|
| **Control status and basis** | `TRUST_CODEX/tables/SCTM_FULL_STATUS_LIST.csv` | Single source of truth for pilot_status and pilot_status_basis. Includes auditor-defensible columns: evidence_location, evidence_regeneration, auditor_requirement (synced from evidence index via `tools/enrich_sctm_with_auditor_requirements.py`). |
| **Human-readable closeout** | `TRUST_CODEX/tables/CONTROL_CLOSEOUT_FROM_SCTM.md` | Generated from SCTM; do not use hand-maintained closeout narratives for status. |
| **Technical pass/fail (VM)** | `validation-report.json` in each validation run | `control_results` per control; required checks and missing_files. |

Do **not** use the following for control status—they are deprecated or context-only:

- `WINDOWS_EVIDENCE_CLOSEOUT.md` — superseded by SCTM + CONTROL_CLOSEOUT_FROM_SCTM.
- Status column in any doc overrides SCTM — it does not; SCTM wins.

---

## 3. Where to find evidence (per control, &lt;2 minutes)

| Need | Location |
|------|----------|
| **Per-control evidence bundle** | Evidence vault: `\\EvidenceVault\CUI-Enclave\controls\<ControlId>\<RunId>\bundle.zip` (see `vault/VAULT_LAYOUT.md`). |
| **What evidence is required per control** | `tables/EVIDENCE_INDEX.md` (generated from `tables/evidence-index.json`). |
| **How to regenerate evidence** | Evidence Index column “Regeneration method” + `vm-scripts/Collect-Cui-Evidence.ps1`, `Test-CuiHardening.ps1`; Azure/Entra: `Export-AzureInheritedControls.ps1`, etc. |
| **Integrity** | Each run: `run.json` (hashes_file); inside bundle: `integrity/` and `validation/`. |

If the vault is not yet deployed, run artifacts live under `C:\evidence\` on the evidence host; sync to vault with `vault/Sync-EvidenceToVault.ps1`. Per-control zip can be built with `tools/package_control_evidence.py`.

---

## 4. Validator vs. claimed status (no over-claim)

For controls with **required validator checks** (e.g. AC.L2-3.1.3 RDP-REDIR, AC.L2-3.1.11 INACTIVITY):

- Do **not** claim the control as **Implemented (Evidenced on Pilot VM)** unless the validation run for that evidence shows all required checks **pass**.
- If `validation-report.json` shows failed checks or missing files for that control, SCTM must show **Planned / Partially Evidenced** (or similar) until remediation and re-run.

See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` for the rule and high-signal checks.

---

## 5. Class B (governance) evidence

- Required records, templates, cadence, and vault paths: `tables/CLASS_B_EVIDENCE_OPERATIONS.md`.
- Governance artifacts under vault: `\\EvidenceVault\CUI-Enclave\governance\<ControlId>\<YYYY>\`.

## 6. Evidence runbook (exact commands)

- **Access path:** VPN + RDP to VM (no Azure Bastion).
- **Runbook:** `docs/EVIDENCE_RUNBOOK.md` — commands for VM session config (Collect-Cui-Evidence.ps1), Entra sign-in logs, role assignments, NSG exports, and integrity.

---

## 7. Quick reference

| Document | Purpose |
|----------|---------|
| `tables/SCTM_FULL_STATUS_LIST.csv` | Authoritative control status and basis. |
| `tables/CONTROL_CLOSEOUT_FROM_SCTM.md` | Generated closeout table from SCTM. |
| `tables/EVIDENCE_INDEX.md` | Evidence type, owner, cadence, location, regeneration per control. |
| `vault/VAULT_LAYOUT.md` | Vault layout; Class B and technical gaps refs. |
| `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` | RDP, inactivity, validator-claim rule. |
| `docs/REMAINING_FINDINGS_AND_BASTION.md` | All findings remediated; access path VPN + RDP; evidence runbook. |
| `docs/C3PAO_ASSESSMENT_CURRENT_STATE_AND_TARGET.md` | Full C3PAO-style assessment and checklist. |
| `reports/C3PAO_SNUFF_TEST_FINDINGS.md` | Per-control snuff test (PASS/WARN/FAIL); run `tools/run_c3pao_snuff_test.py` to refresh. |
| `docs/SYSTEM_OWNER_GUIDE.md` | **System Owner:** conclusive reference (accountability, boundary, SCTM, evidence, sign-off, key docs). |
| `docs/PRE_SUBMISSION_REMEDIATION_AND_HARDENING.md` | Pre-submission checklist: hardening order, validator alignment, Class B wording, no overclaims. |
