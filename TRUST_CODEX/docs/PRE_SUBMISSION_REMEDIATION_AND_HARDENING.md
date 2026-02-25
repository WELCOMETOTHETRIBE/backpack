# Pre-Submission Remediation and Hardening

Use this checklist before delivering the CMMC L2 evidence submission so the handoff is **representative and free of overclaims**. Complete in order.

---

## 1. Validator alignment (no overclaim on VM-evidenced controls)

**Rule:** For any control that has **required validator checks** in `Test-CuiHardening.ps1`, do **not** claim "Implemented (Evidenced on Pilot VM)" unless the validation run used to support that control shows **all** required checks **PASS**.

| Control ID        | Required check(s) | If FAIL → status must be "Planned / Partially Evidenced" |
|-------------------|--------------------|----------------------------------------------------------|
| AC.L2-3.1.3       | RDP-REDIR          | Run hardening (RDP block); re-collect; re-validate.       |
| AC.L2-3.1.9       | LEGALNOTICE        | Configure interactive logon notice; re-collect; re-validate. |
| AC.L2-3.1.10      | SESSION-LOCK       | Harden session lock; re-collect; re-validate.           |
| AC.L2-3.1.11      | INACTIVITY         | Harden inactivity timeout; re-collect; re-validate.      |
| AC.L2-3.1.12      | RM-WINRM           | WinRM disabled; re-collect; re-validate.                 |
| AC.L2-3.1.21      | PORTABLE-STORAGE   | USB/removable disabled; re-collect; re-validate.         |
| IA.L2-3.5.10      | NTLMV2             | Set LmCompatibilityLevel=5; re-collect; re-validate.      |
| IA.L2-3.5.11      | AUTH-UX            | Don't display last username / secure logon; re-collect; re-validate. |

**Action:** After any evidence run, open `validation-report.json` and confirm that for every control you claim as "Implemented (Evidenced on Pilot VM)", the `control_results` entry has no `failed_checks` and no `missing_files` for that control. If it does, either remediate and re-run, or set status to "Planned / Partially Evidenced" in SCTM and regenerate CONTROL_CLOSEOUT_FROM_SCTM.

Reference: [TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md](TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md).

---

## 2. Hardening and evidence run order (on the enclave VM)

Run in this order so the submission is backed by a single, consistent run:

1. **Harden**  
   Run `Invoke-CuiHardening.ps1` (or `Run-CuiHardeningAndValidate-Elevated.ps1` with `KeepRdpAccess $true`). This applies RDP redirection disable, inactivity timeout, session lock, NTLM v2, and auth UX settings. See [EVIDENCE_RUNBOOK.md](EVIDENCE_RUNBOOK.md).

2. **Collect evidence**  
   Run `Run-CuiBulkEvidenceAndValidate.ps1` (or `Collect-Cui-Evidence.ps1` then `Test-CuiHardening.ps1`) to produce `CUI-Evidence-<RunId>` and `CUI-Validation-<RunId>`.

3. **Verify validation**  
   Open `CUI-Validation-<RunId>\validation-report.json`. For each control with required checks (table above), confirm `control_results[control_id]` has no `failed_checks`. If any fail, return to step 1 (fix hardening) and repeat.

4. **Ingest into SCTM**  
   From your workstation, run the validator ingest so SCTM and CONTROL_CLOSEOUT_FROM_SCTM reflect this run. Only then should "Implemented (Evidenced on Pilot VM)" be used for those controls.

5. **Sync to vault (if used)**  
   Run `Sync-EvidenceToVault.ps1` so evidence and validation are under the vault layout. Per-control bundles can then be built with `package_control_evidence.py`.

---

## 3. Class B and governance (representative wording)

- **Governed (Docs Present; Records Pending):** Policy/SOP exist; operational records (e.g. training log, separation-of-duties matrix, IR test report) are not yet in the evidence vault. The submission should **not** claim these controls as fully satisfied; state that policies and procedures are in place and records are produced per cadence (see [CLASS_B_EVIDENCE_OPERATIONS.md](../tables/CLASS_B_EVIDENCE_OPERATIONS.md)).
- **Governed (Records Attached):** Evidence index and vault contain the referenced governance records (e.g. validation report for CA.L2-3.12.1). Safe to reference in submission.

Do not use "all 110 controls implemented" or "full compliance achieved." Use the exact SCTM statuses: "Implemented (Evidenced on Pilot VM)", "Governed (Docs Present; Records Pending)", "Governed (Records Attached)", "N/A (Documented)", "Planned / Partially Evidenced."

---

## 4. Evidence verifiability

Evidence is **verifiable** when:
- **Location** is a real path (VM: `C:\evidence\CUI-Evidence-<RunId>\` or vault: `\\EvidenceVault\CUI-Enclave\...` or governance path or TRUST_CODEX doc), and  
- **Regeneration method** is actionable (Run/Export/hash/store or "per docs/EVIDENCE_RUNBOOK.md").

The C3PAO full assessment script counts how many controls have verifiable evidence. Ensure the evidence index uses concrete locations and regeneration methods so the count is accurate. Actual artifacts still require running the runbook (VM + optional Entra/Azure exports).

---

## 5. Overclaim language (must fix before submission)

- **SSP / narrative:** Remove or replace any phrase like "all 110 controls implemented" or "full compliance achieved" with assessment-safe language (e.g. "controls are implemented, governed, or documented as N/A per boundary; status per SCTM and validation report").
- **Gaps chapter:** [chapters/90_Gaps_Risks_and_POAM_Candidates.md](../chapters/90_Gaps_Risks_and_POAM_Candidates.md) already calls out overclaim risk; ensure no other doc contradicts it.
- **Governance bundle:** Templates may reference "SSP" or historical implementations; do not treat as attestation of current pilot state unless explicitly aligned.

---

## 6. Pre-submission checklist (summary)

- [ ] Hardening applied on enclave VM (RDP-REDIR, INACTIVITY, SESSION-LOCK, NTLMV2, AUTH-UX, LEGALNOTICE as required).
- [ ] Evidence and validation run completed; `validation-report.json` shows PASS for all required checks on controls claimed as Implemented.
- [ ] SCTM (and CONTROL_CLOSEOUT_FROM_SCTM) updated from this validation run; no "Implemented" for controls with failed required checks.
- [ ] No overclaim language in SSP, chapters, or handoff docs ("all implemented" / "full compliance" removed or replaced).
- [ ] Class B status wording is "Governed (Docs Present; Records Pending)" or "Governed (Records Attached)" as appropriate; no implied full satisfaction without records.
- [ ] Evidence submission document (when created) maps demand sheet to artifacts and states the validator-alignment and Class B rules above.

---

## References

- [TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md](TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md) — Required checks, hardening references.
- [EVIDENCE_RUNBOOK.md](EVIDENCE_RUNBOOK.md) — Exact commands for VM and Entra/Azure evidence.
- [CLASS_B_EVIDENCE_OPERATIONS.md](../tables/CLASS_B_EVIDENCE_OPERATIONS.md) — Governance records, cadence, vault paths.
- [C3PAO_READINESS.md](C3PAO_READINESS.md) — Single deliverable and where to find evidence.
