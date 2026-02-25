# Continuity Sweep — True-Up and Single Source of Truth

This document records the **continuity sweep** to remove outdated information (Bastion, placeholders, stale evidence text) and align all artifacts to the current model: **VPN + RDP** access path, **evidence-index.json** and **SCTM_FULL_STATUS_LIST.csv** as canonical, and **EVIDENCE_RUNBOOK.md** for commands.

---

## What was trued up

| Area | Change |
|------|--------|
| **Canonical evidence** | `tables/evidence-index.json` — already used VPN+RDP artifact names and real vault paths; no change needed. |
| **SCTM dataset (GUI)** | `sctm/sctm-data.json` — metadata `admin_access` set to "VPN + RDP to VM; no public RDP". Per-control **evidence** (location, artifact, regeneration_method) synced from evidence-index. **Implementation** and **classification_justification** / **na_justification** — all "Bastion" wording replaced with VPN+RDP. |
| **SCTM GUI** | `sctm/SCTM_GUI.html` and `sctm/sctm-data.embedded.js` — regenerated from updated sctm-data.json so the GUI shows current access path and evidence. |
| **VM scripts** | `Export-AzureInheritedControls.ps1` (Bastion/JIT → VPN/RDP access config), `Invoke-CuiAzureHardening.ps1` (Bastion → VPN+RDP in comments/findings), `build_control_implementation_map.py` (Bastion → VPN+RDP in guidance). |
| **Root runbooks** | `README_WINDOWS2025_EVIDENCE_RUNBOOK.md`, `WINDOWS2025_OS_EVIDENCE_PACK.md`, `tools/collect_windows2025_cmmc_evidence.ps1` — Bastion → VPN/jump in screenshot and evidence hints. |
| **Working artifacts** | `_working/vm-artifacts/codex-manual-progress-latest.json` — Bastion → VPN/RDP in retention note. |
| **Evidence Index in viewer** | `_build/CODEX_VIEWER.html` embeds a snapshot of `tables/EVIDENCE_INDEX.md`. Run `tools/refresh_codex_viewer_evidence_index.py` after updating the evidence index so the offline viewer shows VPN+RDP (no Bastion). |
| **Other tables** | `tables/CLASS_A_IMPLEMENTATION_PLAN.md`, `tables/CONTROL_EVIDENCE_MAPPING_INDEX.csv`, `tables/CLASS_A_NOT_IMPLEMENTED_CLOSEOUT_PLAN.md` — Bastion → VPN+RDP / Azure/Entra/VPN+RDP. |

---

## How to keep everything aligned

1. **Evidence index is canonical for evidence.**  
   When you change `tables/evidence-index.json`, run:
   - `python TRUST_CODEX/tools/build_evidence_index_md.py --trust-codex-dir TRUST_CODEX`
   - `python TRUST_CODEX/tools/build_control_implementation_map.py`
   - `python TRUST_CODEX/tools/enrich_sctm_with_auditor_requirements.py` (updates SCTM CSV columns)
   - `python TRUST_CODEX/tools/sync_sctm_data_from_evidence_index.py` (updates sctm-data.json + embedded GUI payload)
   - `python TRUST_CODEX/tools/refresh_codex_viewer_evidence_index.py` (updates Evidence Index snapshot in `_build/CODEX_VIEWER.html` so the offline manual shows current artifact names)

2. **SCTM status is canonical in CSV.**  
   Control status lives in `tables/SCTM_FULL_STATUS_LIST.csv`. Generated views: `CONTROL_CLOSEOUT_FROM_SCTM.md` (via `generate_closeout_from_sctm.py`). Do not use hand-maintained closeout narratives for status.

3. **Access path is VPN + RDP.**  
   Any new doc or script that describes admin access should say "VPN + RDP to VM; no public RDP" (not Bastion).

4. **C3PAO full assessment.**  
   Run `python TRUST_CODEX/tools/run_c3pao_full_assessment.py` to check consistency and Bastion-in-narrative; fix any WARNs.

---

## Scripts added or used

| Script | Purpose |
|--------|---------|
| `tools/sync_sctm_data_from_evidence_index.py` | Syncs sctm-data.json from evidence-index (locations, artifact names, regeneration); sets metadata admin_access; replaces Bastion wording in implementation and justification fields; regenerates sctm-data.embedded.js and SCTM_GUI.html inline JSON. Run after evidence-index or pilot_defaults changes. |
| `tools/enrich_sctm_with_auditor_requirements.py` | Adds evidence_location, evidence_regeneration, auditor_requirement to SCTM_FULL_STATUS_LIST.csv from evidence-index. Run after evidence-index changes. |
| `tools/refresh_codex_viewer_evidence_index.py` | Replaces the embedded `tables/EVIDENCE_INDEX.md` snapshot in `_build/CODEX_VIEWER.html` with the current file. Run after `build_evidence_index_md.py` so the offline Trust Codex Manual shows VPN+RDP artifact names. |

---

## References

- **Evidence Index:** `tables/evidence-index.json` (source), `tables/EVIDENCE_INDEX.md` (generated)
- **Evidence Runbook:** `docs/EVIDENCE_RUNBOOK.md`
- **SCTM CSV (pipeline):** `tables/SCTM_FULL_STATUS_LIST.csv`
- **SCTM GUI data:** `sctm/sctm-data.json` (synced from evidence-index + status from CSV or manual edits)
- **Remaining findings:** `docs/REMAINING_FINDINGS_AND_BASTION.md`
