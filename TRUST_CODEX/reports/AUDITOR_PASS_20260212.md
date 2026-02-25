# Auditor Pass — Evidence Run 20260212-082524

**Assessment date:** 2026-02-12  
**Evidence run:** 20260212-082524  
**VM:** cui-win-pilot-0 (admin_patrick@20.57.129.142)

This report records an **auditor pass** using the evidence collected from the enclave VM and the Codex consistency assessments. It is suitable to show an assessor that (1) artifacts were produced by running the runbook, (2) VM validation passed, and (3) index/SCTM and double-blind methodology pass.

---

## 1. Evidence run summary

| Item | Value |
|------|--------|
| **Run ID** | 20260212-082524 |
| **Generated (UTC)** | 2026-02-12T08:25:24Z |
| **VM host** | cui-win-pilot-0 |
| **Evidence path** | `evidence/runs/20260212-082524/raw/CUI-Evidence-20260212-082524/` |
| **Validation path** | `evidence/runs/20260212-082524/raw/CUI-Validation-20260212-082524/` |
| **Artifacts collected** | 56 files (rdp-policy.txt, secpol.cfg, defender-status.txt, hashes.sha256.txt, etc.) |

---

## 2. VM validation result (Test-CuiHardening.ps1)

| Result | Count |
|--------|--------|
| **PASS** | 39 |
| **FAIL** | 0 |
| **Total checks** | 39 |

All 39 validator checks passed. These checks assert configuration and evidence-bundle requirements for the pilot VM (e.g. FIPS, TLS baseline, firewall, RDP redirection disabled, session lock, Defender on, BitLocker, USB disabled).

**Controls with at least one check in this run:** 30 unique controls (AC, AU, CM, IA, MP, SC, SI families). See section 4 below.

---

## 3. Codex consistency assessments (run after this evidence)

| Assessment | Result |
|------------|--------|
| **C3PAO Full Assessment** | 0 ERROR, 0 WARN, 0 INFO. Evidence verifiability: 110/110 controls verifiable. |
| **C3PAO Double-Blind Assessment** | Evidence ready for all 110 controls: **YES**. All seven inquisitions: 0 failures. |

Reports:
- `reports/C3PAO_FULL_ASSESSMENT_FINDINGS.md`
- `reports/C3PAO_DOUBLE_BLIND_ASSESSMENT.md`

---

## 4. Controls evidenced by this run (VM validator)

The following 30 controls had at least one validation check run against the evidence bundle; all checks for these controls **passed**.

| Control ID | Control ID | Control ID | Control ID |
|------------|------------|------------|------------|
| AC.L2-3.1.1 | AC.L2-3.1.10 | AC.L2-3.1.11 | AC.L2-3.1.12 |
| AC.L2-3.1.21 | AC.L2-3.1.3 | AC.L2-3.1.5 | AC.L2-3.1.8 |
| AC.L2-3.1.9 | AU.L2-3.3.1 | AU.L2-3.3.7 | CM.L2-3.4.1 |
| CM.L2-3.4.2 | CM.L2-3.4.5 | CM.L2-3.4.8 | IA.L2-3.5.1 |
| IA.L2-3.5.10 | IA.L2-3.5.11 | IA.L2-3.5.7 | IA.L2-3.5.8 |
| MP.L2-3.8.1 | MP.L2-3.8.7 | SC.L2-3.13.1 | SC.L2-3.13.11 |
| SC.L2-3.13.6 | SC.L2-3.13.8 | SI.L2-3.14.1 | SI.L2-3.14.2 |
| SI.L2-3.14.4 | SI.L2-3.14.6 | | |

---

## 5. Auditor verdict

- **Evidence produced:** Yes. Runbook was executed on the enclave VM; evidence and validation outputs were pulled to `evidence/runs/20260212-082524/`.
- **VM validation:** 39/39 checks PASS.
- **Index/SCTM alignment:** Full assessment and double-blind assessment both pass (110/110 controls; no placeholder locations; actionable regeneration; status–evidence alignment).
- **Artifacts location:** Evidence and validation are under `evidence/runs/20260212-082524/raw/`. Per-control bundles can be built with `tools/package_control_evidence.py` if needed; vault sync uses `vault/Sync-EvidenceToVault.ps1` when the evidence vault is available.

---

## 6. Where to show the auditor evidence on the VM

**Single location on the VM:** `C:\evidence\`

- **Evidence artifacts:** `C:\evidence\CUI-Evidence-<RunId>\` (e.g. 20260212-082524) — 56 files.
- **Validation report:** `C:\evidence\CUI-Validation-<RunId>\` — validation-report.txt / .json.
- **Auditor instructions:** Copy `vm-scripts/README-for-auditor.txt` to `C:\evidence\README-for-auditor.txt` on the VM so the auditor sees a “start here” in that folder.
- **Optional:** Copy `_build/CODEX_VIEWER.html` to `C:\evidence\CODEX_VIEWER.html` on the VM so the auditor can open the Codex in a browser on the VM.

See **`docs/AUDITOR_VIEW_ON_VM.md`** for full setup and optional vault path.

---

## 7. References

- Evidence runbook: `docs/EVIDENCE_RUNBOOK.md`
- Evidence index: `tables/EVIDENCE_INDEX.md` (from `tables/evidence-index.json`)
- Vault layout: `vault/VAULT_LAYOUT.md`
- C3PAO readiness: `docs/C3PAO_READINESS.md`
- Where to show auditor on VM: `docs/AUDITOR_VIEW_ON_VM.md`
