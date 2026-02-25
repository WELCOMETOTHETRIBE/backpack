# Evidence Index Assessment (C3PAO-style) — CMMC Level 2 / 800-171 Rev.2

Assessment scope: `TRUST_CODEX/tables/EVIDENCE_INDEX.md` (pilot), cross-checked against:

- `TRUST_CODEX/tables/SCTM_FULL_STATUS_LIST.csv` (control status + basis)
- `TRUST_CODEX/vm-scripts/Collect-Cui-Evidence.ps1` (Windows evidence bundle)
- `TRUST_CODEX/vm-scripts/Test-CuiHardening.ps1` (read-only validator + `control_results`)
- `TRUST_CODEX/tables/WINDOWS_EVIDENCE_CLOSEOUT.md`
- `TRUST_CODEX/tables/VM_EVIDENCED_CLASS_A_CONTROLS.md`
- `TRUST_CODEX/tables/CONTROL_EVIDENCE_MAPPING_INDEX.md`

## Summary (high-signal)

- **Strength**: You already produce high-quality, objective Windows evidence bundles with integrity (`hashes.sha256.txt`) and a machine-readable validator report (`validation-report.json`).
- **Main gap**: The Evidence Index is still largely an **index of intent** rather than an **index of retrievable evidence**. Most locations are placeholders (e.g., “Evidence vault … (to be implemented)”), which will slow or block an assessor.
- **Main risk**: **Cross-file drift**. Control statuses and “closeable now” narratives can contradict each other unless they are generated from the same underlying validator outputs and stored evidence.

## Findings (what a C3PAO will challenge)

### 1) Evidence vault placeholders (retrievability risk)

Many entries point to a non-existent vault path (“to be implemented”). This makes it impossible for an assessor to quickly retrieve per-control objective evidence from a canonical location.

Impact:

- Evidence handoff becomes manual and error-prone
- Increases risk of “can’t find it” findings during assessment
- Prevents fast per-control packaging

Remediation direction:

- Standardize an encrypted fileshare vault layout and update the index to point to **control-centric** locations (not just run-centric VM folders).

### 2) Evidence is run-centric, not control-centric (handoff friction)

The current Windows bundle design is good (timestamped “runs”), but assessors often ask for:

- “Show me the evidence for **AC.L2-3.1.11**”
- “Now do **AU.L2-3.3.1**”

Without per-control bundling, you will repeatedly “hunt inside the run zip” and explain file mappings live.

Remediation direction:

- Produce **per-control evidence zips** (auto-built) that include the relevant artifacts + validator pass/fail basis for that control.

### 3) Framework reference mismatch (assessor confusion risk)

`EVIDENCE_INDEX.md` currently references **NIST SP 800-171 Rev.3** as explanatory context.

That is acceptable as supplemental context, but for CMMC Level 2 you must keep:

- **Authoritative mapping**: **NIST SP 800-171 Rev.2**
- **Rev.3**: “future reference / explanatory only”

Remediation direction:

- Update the Evidence Index preamble to make Rev.2 authoritative and explicitly label Rev.3 as non-authoritative context.

### 4) Cross-file contradictions / drift (audit defensibility risk)

There are multiple sources of truth today:

- `SCTM_FULL_STATUS_LIST.csv` (status/basis)
- closeout narrative docs (`WINDOWS_EVIDENCE_CLOSEOUT.md`, `VM_EVIDENCED_CLASS_A_CONTROLS.md`)
- validator `control_results`

If they diverge, an assessor will view the system as not well-controlled.

Remediation direction:

- Treat validator output + stored evidence as the authoritative technical basis.
- Generate any “closeout” / “evidenced controls” lists from those authoritative artifacts.

### 5) “Generic” artifact descriptions (needs operational specificity)

Evidence Index now uses concrete names; exact commands in `docs/EVIDENCE_RUNBOOK.md`.

## Remediation completed

The following actions have been implemented. **Use these as the current state for C3PAO readiness.**

| Finding | Remediation |
|---------|-------------|
| 1) Evidence vault placeholders | **Done.** Canonical index (`evidence-index.json`) uses real vault paths (`\\EvidenceVault\CUI-Enclave\...`). No “to be implemented” locations. |
| 2) Run-centric not control-centric | **Done.** Per-control bundles: `tools/package_control_evidence.py` → `controls/<ControlId>/<RunId>/bundle.zip`. Vault layout in `vault/VAULT_LAYOUT.md`. |
| 3) Framework reference (Rev.2 vs Rev.3) | **Done.** `EVIDENCE_INDEX.md` preamble: CMMC L2 authoritative against NIST SP 800-171 Rev.2; Rev.3 reference only. |
| 4) Cross-file drift | **Done.** Single source of truth: **SCTM_FULL_STATUS_LIST.csv** for status. Closeout table **CONTROL_CLOSEOUT_FROM_SCTM.md** is generated from SCTM. Legacy narrative closeout (`WINDOWS_EVIDENCE_CLOSEOUT.md`) deprecated. Validator output (`validation-report.json` control_results) is the technical basis; do not claim Implemented when required checks fail. See `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`. |
| 5) Generic artifact descriptions | **Done.** Evidence Index uses concrete artifact names (VPN + RDP access path). `docs/EVIDENCE_RUNBOOK.md` provides exact commands for VM evidence, Entra sign-in logs, role assignments, and NSG exports. |

**Assessor one-pager:** `docs/C3PAO_READINESS.md` — authoritative sources and where to find evidence in &lt;2 minutes per control.

**Generated artifacts (CI):** `EVIDENCE_INDEX.md`, `control-implementation-map.json`, `CONTROL_CLOSEOUT_FROM_SCTM.md` are regenerated in `.github/workflows/codex-validate.yml` so they stay consistent with the canonical index and SCTM.

