---
title: "Trust Codex — Viewer"
description: "Single-file Markdown entrypoint for the Trust Codex (designed for a beautiful Markdown UI renderer)"
---

# Trust Codex — Viewer (Markdown)

This is the Markdown-native entrypoint for the **MacTech CUI Pilot Trust Codex**. It is intended to be rendered by a **modern Markdown UI** (sidebar TOC, search, callouts, and rich tables).

> [!IMPORTANT]
> **Authoritative control set**: NIST SP 800-171 Rev.2 (CMMC 2.0 Level 2).
>
> This Codex is written to be **assessment-safe**: it avoids overclaiming and distinguishes **system-enforced (Class A)** vs **governance/inherited/N/A (Class B)** satisfaction.

## How to use this in a “beautiful Markdown interpreter UI builder”

- **Navigation**: Render each linked file as a page; treat this file as the landing page.
- **Assessor mode**: Provide a “Reading order” view and a “Show evidence links first” toggle.
- **Engineer mode**: Provide quick links to `tables/EVIDENCE_INDEX.md`, SCTM GUI, and VM hardening/evidence ops.
- **Search**: Index `chapters/`, `tables/`, and `schemas/` for full-text search.

## Quick start (assessor path)

- **Boundary and data handling**: `chapters/02_CUI_Boundary_and_Data_Handling.md`
- **Control philosophy / non-claims**: `chapters/04_Control_Philosophy_and_Non_Claims.md`
- **Controls narrative**: `chapters/10_System_Enforced_Controls_by_Family.md` and `chapters/11_Governance_Inherited_and_NA_Controls.md`
- **Evidence index (assessment-ready)**: `tables/EVIDENCE_INDEX.md`
- **Mapping table (110 requirements)**: `tables/CONTROL_MAPPING_800-171R2.md`
- **Assessor interview playbook**: `chapters/21_Assessor_Readiness_Playbook.md`

## Operational evidence tooling (Windows Server 2025 pilot)

- **OS Evidence Pack (Class A closeout)**: `../WINDOWS2025_OS_EVIDENCE_PACK.md`
- **Evidence collector script**: `../tools/collect_windows2025_cmmc_evidence.ps1`
- **Collector runbook**: `../README_WINDOWS2025_EVIDENCE_RUNBOOK.md`

## SCTM (GUI editor)

- **SCTM GUI**: `sctm/SCTM_GUI.html`
- **SCTM canonical dataset**: `sctm/sctm-data.json`
- **SCTM readme**: `sctm/README.md`

## Reading order (book structure)

### Front matter

- [Executive Foreword](chapters/00_Executive_Foreword.md)
- [System Purpose & Trust Model](chapters/01_System_Purpose_and_Trust_Model.md)
- [CUI Boundary Definition & Data Handling](chapters/02_CUI_Boundary_and_Data_Handling.md)
- [Threat & Risk Framing (non-alarmist)](chapters/03_Threat_and_Risk_Framing.md)
- [Control Philosophy (and explicit non-claims)](chapters/04_Control_Philosophy_and_Non_Claims.md)

### Controls (narrative by family)

- [System-Enforced Controls (narrative by family)](chapters/10_System_Enforced_Controls_by_Family.md)
- [Governance-Satisfied, Inherited, and Not Applicable Controls](chapters/11_Governance_Inherited_and_NA_Controls.md)

### Mapping + evidence

- [Explicit Control Mapping — NIST SP 800-171 Rev.2 (110 requirements)](tables/CONTROL_MAPPING_800-171R2.md)
- [Evidence Index (assessment-ready)](tables/EVIDENCE_INDEX.md)
- [schemas/evidence-index.schema.yml](schemas/evidence-index.schema.yml)

### Operations

- [Operational Guardrails](chapters/20_Operational_Guardrails.md)
- [Assessor Readiness Playbook (what is shown vs described)](chapters/21_Assessor_Readiness_Playbook.md)
- [VM Hardening & Evidence Operations (pilot)](chapters/22_VM_Hardening_and_Evidence_Operations.md)

### Gaps, risks, and plan of action

- [Gaps, Risks, and POA&M Candidates (explicit)](chapters/90_Gaps_Risks_and_POAM_Candidates.md)

### Docs (reference)

- [System Owner Guide — Conclusive Reference](docs/SYSTEM_OWNER_GUIDE.md)
- [C3PAO Readiness (assessor one-pager)](docs/C3PAO_READINESS.md)
- [Evidence Runbook](docs/EVIDENCE_RUNBOOK.md)
- [Technical Gaps and Validator Alignment](docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md)
- [C3PAO Assessment: Current State and Target](docs/C3PAO_ASSESSMENT_CURRENT_STATE_AND_TARGET.md)
- [Remaining Findings](docs/REMAINING_FINDINGS_AND_BASTION.md)

## Rendering recommendations (for the UI builder)

- **Callouts**: support GitHub-style callouts (`> [!NOTE]`, `> [!WARNING]`, etc.).
- **Mermaid**: enable `mermaid` blocks for diagrams if supported.
- **Tables**: keep wide tables scrollable; prefer sticky headers for `tables/EVIDENCE_INDEX.md` and mapping tables.
- **Permalinks**: support heading anchors for assessor citations.
- **Print/PDF**: provide a print-friendly theme for offline assessment packages.

---

> [!NOTE]
> If you previously used the offline HTML viewer (`_build/CODEX_VIEWER.html`), this Markdown file is the equivalent entrypoint for Markdown-native viewers.

