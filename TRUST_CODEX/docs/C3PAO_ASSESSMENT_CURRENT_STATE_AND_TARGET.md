# C3PAO-Style Assessment: Current State and Target

This document captures a C3PAO-ready view of the CUI Enclave evidence program: what is strong today, what would fail or slow a real CMMC L2 evidence handoff, the target state, and an implementation checklist with status.

**Authoritative control set for CMMC L2**: NIST SP 800-171 Rev.2. Rev.3 is used in the Codex for explanatory and forward-looking planning only.

---

## 1. What’s strong already

| Area | Status | Notes |
|------|--------|--------|
| **Control-to-evidence intent** | ✅ | `EVIDENCE_INDEX.md` includes owner, cadence, retention, regeneration method. Source: canonical `tables/evidence-index.json` validated by `schemas/evidence-index.schema.yml`. |
| **Objective technical evidence (Windows)** | ✅ | `vm-scripts/Collect-Cui-Evidence.ps1` produces timestamped bundles with `manifest.txt` and `hashes.sha256.txt`. |
| **Validator (machine-readable)** | ✅ | `vm-scripts/Test-CuiHardening.ps1` produces PASS/FAIL checks and `validation-report.json` with `control_results`. |
| **Run coherence** | ✅ | `vm-scripts/Run-CuiBulkEvidenceAndValidate.ps1` ties collection + validation to the same RunId. |
| **Shared responsibility** | ✅ | `manual_app/docs/03_Shared_Responsibility_Matrix.md` and `vm-scripts/Export-AzureInheritedControls.ps1` establish boundary + provider evidence expectations. |
| **Assessor/operator workflow** | ✅ | Offline Manual App (`manual_app/`) adjudicates controls and exports progress; data in `manual-data.json` aligned with SCTM + evidence index. |
| **Canonical index + schema** | ✅ | `evidence-index.json` + `evidence-index.schema.yml`; `EVIDENCE_INDEX.md` generated in CI; no placeholder locations. |
| **Vault layout defined** | ✅ | `vault/VAULT_LAYOUT.md`: runs, controls, governance, provider; append-only semantics. |
| **Per-control bundle packager** | ✅ | `tools/package_control_evidence.py`: RunId + control_id → `controls/<ControlId>/<RunId>/bundle.zip` with README, artifacts/, validation/, integrity/. |
| **Vault sync** | ✅ | `vault/Sync-EvidenceToVault.ps1` syncs CUI-Evidence-*, CUI-Validation-*, CUI-Azure-*, CUI-Azure-Inheritance-* to vault; writes `run.json` with `hashes_file` when present. |
| **Technical gaps documented** | ✅ | `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`: RDP redirection, inactivity timeout, validator-vs-claim rule. |
| **Class B operationalized** | ✅ | `tables/CLASS_B_EVIDENCE_OPERATIONS.md`: required records, templates, cadence, bundle paths per Class B control. |

---

## 2. What will fail (or slow you down) in a real handoff — and remediation status

| Risk | Remediation status |
|------|--------------------|
| “Evidence vault (to be implemented)” placeholders | **Done.** Evidence index uses real vault paths (`\\EvidenceVault\CUI-Enclave\...`). Validator flags any remaining placeholders. |
| Evidence run-centric only, not control-centric | **Done.** Per-control bundles via `package_control_evidence.py`; vault layout has `controls/<ControlId>/<RunId>/bundle.zip`. |
| Over-generic artifact descriptions | **Done.** Index uses concrete names (VM session config + Entra sign-in logs + role assignments, VPN + RDP access path). `docs/EVIDENCE_RUNBOOK.md` has exact commands. |
| Cross-file drift (WINDOWS_EVIDENCE_CLOSEOUT vs SCTM vs validator) | **Mitigated.** CI validates 110 controls, index ↔ SCTM ↔ manual-data parity; closeout should be generated from validator outputs (see TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md). |
| Framework reference (Rev.2 vs Rev.3) | **Done.** EVIDENCE_INDEX.md preamble: CMMC L2 authoritative against Rev.2; Rev.3 forward-looking only. |

---

## 3. Target state (evidence retrievable in &lt;2 minutes per control)

For every control ID, a single zip can be handed over that contains:

| Element | How we get there |
|---------|------------------|
| **Objective artifacts** | Run raw dir + governance/provider paths; packager pulls from vault by control + RunId. |
| **Integrity** | `hashes.sha256.txt` in run raw; `run.json` references it; bundle includes `integrity/`. |
| **Provenance** | RunId, host, operator, tool version in run.json and README. |
| **Adjudication basis** | `validation/control-result.json` + `validation/checks.json` slice for that control. |
| **Traceability** | README links to Evidence Index; retention/cadence in index and CLASS_B_EVIDENCE_OPERATIONS. |

**Canonical index**: `evidence-index.json` (schema-validated); `EVIDENCE_INDEX.md` generated in CI; drift check fails if md not regenerated from index.

**Vault as source of truth**: Layout in VAULT_LAYOUT.md; append-only (new RunIds only); sync script + packager use same layout.

---

## 4. Implementation checklist

| # | Item | Status | Notes |
|---|------|--------|--------|
| 1 | Structured evidence index (YAML/JSON) + schema | ✅ | `evidence-index.json`, `evidence-index.schema.yml` |
| 2 | Auto-generate EVIDENCE_INDEX.md | ✅ | `tools/build_evidence_index_md.py`; CI runs it and fails if drift |
| 3 | Auto-generate control-implementation-map.json | ✅ | `tools/build_control_implementation_map.py`; CI runs it |
| 4 | No-drift consistency: 110 controls, ≥1 evidence item per control | ✅ | `validate_codex_data.py`; CI runs it |
| 5 | Evidence vault layout documented | ✅ | `vault/VAULT_LAYOUT.md` |
| 6 | Sync run artifacts to vault (run.json + hashes_file) | ✅ | `vault/Sync-EvidenceToVault.ps1` |
| 7 | Per-control bundle (README, artifacts/, validation/, integrity/) | ✅ | `tools/package_control_evidence.py` |
| 8 | CI: schema + consistency + regenerate index + drift check | ✅ | `.github/workflows/codex-validate.yml` |
| 9 | Framework language: Rev.2 authoritative, Rev.3 reference only | ✅ | In `build_evidence_index_md.py` output |
| 10 | Remove/replace placeholder locations | ✅ | Index uses vault paths; validator flags placeholders |
| 11 | RDP redirection + inactivity timeout (hardening + validator) | ✅ | Invoke-CuiHardening sets them; TECHNICAL_GAPS doc |
| 12 | Validator alignment rule (claim only when checks pass) | ✅ | TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md |
| 13 | Class B: required records, templates, cadence, bundle paths | ✅ | CLASS_B_EVIDENCE_OPERATIONS.md |
| 14 | Self-hosted runner in enclave (scheduled evidence + vault publish) | ⏳ | Pipeline def in place; runner must be deployed inside enclave |
| 15 | Closeout lists generated from canonical source (not hand-maintained) | ✅ | CONTROL_CLOSEOUT_FROM_SCTM.md generated from SCTM in CI |

---

## 5. CI/CD inside enclave (pipeline definition)

The following can run on a **self-hosted runner inside the enclave**:

1. **Validate** schemas and consistency (index ↔ SCTM ↔ manual-data).
2. **Regenerate** EVIDENCE_INDEX.md and control-implementation-map.json.
3. **Execute** evidence collection/validation on schedule or per-change (on evidence host).
4. **Sync** run artifacts to encrypted fileshare (Sync-EvidenceToVault.ps1).
5. **Package** per-control bundles and optionally emit a release-style evidence bundle for assessment periods.

Current GitHub workflow (`.github/workflows/codex-validate.yml`) covers (1) and (2) and runs on push/PR. Steps (3)–(5) require the runner and evidence host to be inside the enclave and are operational setup.

---

## 6. References

**For assessors:** Start with **`docs/C3PAO_READINESS.md`** — one-page authoritative sources and where to find evidence.

| Doc | Purpose |
|-----|---------|
| `docs/C3PAO_READINESS.md` | **C3PAO one-pager:** authoritative status (SCTM), where to find evidence, validator rule. |
| `tables/EVIDENCE_INDEX.md` | Human-readable evidence index (generated). |
| `tables/evidence-index.json` | Canonical structured index. |
| `schemas/evidence-index.schema.yml` | Schema for index. |
| `vault/VAULT_LAYOUT.md` | Encrypted fileshare layout; Class B + technical gaps refs. |
| `tables/CLASS_B_EVIDENCE_OPERATIONS.md` | Class B required records, templates, cadence, paths. |
| `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` | RDP, inactivity, validator-claim rule. |
| `reports/EVIDENCE_INDEX_ASSESSMENT.md` | Earlier C3PAO-style findings. |
| `tables/CONTROL_MAPPING_800-171R2.md` | Control intent and classification (Rev.2). |
| `docs/REMAINING_FINDINGS_AND_BASTION.md` | All findings remediated; **access path is VPN + RDP** (no Bastion); runbook and status. |
