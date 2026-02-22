# Trust Codex → CMMC Control Plane Integration Plan

This document describes how we pull the **Trust Codex Manual** (onboarding, Auditor Manual, Governance, POA&M, ConMon, Drift Guard, Training, SSP, Exports) into the **CMMC Control Plane** with a single, beautiful UX.

## Current state

- **Trust Codex Manual** (manual_app): Local/web app with Onboarding, Auditor Manual, Governance, POA&M, ConMon, Drift Guard, Audit logs, Antivirus, SSP, Exports, Training, Docs, Tools. Data: `manual-data.json`, `governance-manifest.json`, VM evidence at `C:\evidence\`.
- **CMMC Control Plane** (this app): Next.js on Railway. Controls (110), POA&M, evidence metadata, SSP sections, policies, attestations, assessor mode, export ZIP. Seed already reads `manual-data.json` for control titles and NIST text.

## Integration phases

### Phase 1 — Codex control metadata in Control Plane ✅ (in progress)

- **Schema**: `controls.codex_metadata` (jsonb) stores per-control Codex fields: classification, pilot_status_basis, evidence (artifact, location, regeneration_method), policy_sop_refs, implementation_summary.
- **Sync**: Seed (or separate import script) reads `TRUST_CODEX/manual_app/manual-data.json` and upserts `codex_metadata` for each control.
- **UI**:
  - **Control detail**: “Auditor manual” section: classification, status basis, evidence location, regeneration method, NIST text, policy/SOP refs.
  - **Dashboard**: Onboarding-style summary: adjudication by bucket (Enclave, Governance, Azure/Entra, Inherited, N/A) and “Next step” when applicable.

### Phase 2 — Onboarding and Auditor Manual parity

- **Onboarding page**: Attestee, adjudication 107/110, closeout-by-bucket progress, “Identify → Hardening & Validation → SRM” steps. Data from control implementations + codex_metadata.
- **Auditor Manual view**: List 110 controls with filters (adjudicated/outstanding, by bucket). Per-control detail: status, evidence location, regeneration, NIST text, live verification placeholder. Reuse control detail page with “auditor” layout.

### Phase 3 — Governance (doc review & sign-off)

- **Governance tab**: List policies/SOPs from Codex governance manifest (or Control Plane `policies`). Per-doc: view, sign+date, advance. “Bulk sign”, “Write governance artifact (C:\evidence)” → export JSON/MD for VM or vault.
- **Data**: Ingest `governance-manifest.json` or mirror structure in `policies` + attestations. Optional: API to push sign-off artifact to VM/vault.

### Phase 4 — POA&M and ConMon

- **POA&M**: Already in Control Plane. Enhance with “latest-run” POA&M items: link to validator fail codes (e.g. ENTRA-MFA, AZ-NSG), severity, “Write POA&M artifact (C:\evidence)”. Ingest validation-run output when available.
- **ConMon**: Cadence tasks per control (weekly/monthly/quarterly/annual/per-change). “Due now” / “Due soon” / “Overdue” / “OK”. “Record completion” with evidence ref and notes. Store in evidence_metadata or new `conmon_completions` table. “Write ConMon snapshot (C:\evidence)” export.

### Phase 5 — Drift Guard, Training, SSP deliverable

- **Drift Guard**: Baseline vs last check (from VM validation runs). Show regressions (PASS→FAIL) and improvements (FAIL→PASS). Requires ingestion of validation-report.json from runs or API from VM.
- **Training**: Upload training certificates, record completion in log (e.g. MAC-SEC-110). Store in evidence_metadata or `training_completions`; “View training log” export.
- **SSP deliverable**: Build export-ready SSP + assessor appendix (SCTM snapshot + evidence run metadata). Reuse SSP sections + control implementation status; add “Capture snapshot”, “Download build launcher” workflow.

### Phase 6 — Exports and Docs

- **Exports**: Align Control Plane export ZIP with Codex export formats (attestation markdown, governance signoffs, evidence run summary). Add “Auditor pack” option.
- **Docs**: Embed or link Codex docs (Evidence Closeout, Governance Review, Shared Responsibility) in Control Plane “Docs” or “Help”.

## Data flow

- **Source of truth for control catalog and Codex metadata**: `TRUST_CODEX` (manual-data.json, SCTM, evidence index). Control Plane syncs via seed or “Import Codex” job.
- **Source of truth for org-specific state**: Control Plane DB (implementations, POA&M, evidence metadata, attestations, policies).
- **VM evidence**: Still generated on VM (`C:\evidence\`). Control Plane can reference paths, ingest validation JSON, or receive uploads later.

## UX principles

- Single navigation: Dashboard, Controls, Auditor Manual, Onboarding, Governance, POA&M, ConMon, Drift Guard, Training, SSP, Exports, Settings.
- Consistent styling with the Control Plane (Tailwind, clear hierarchy). Preserve Codex concepts (buckets, cadence, regeneration method) in copy and layout.
- Assessor mode: Read-only view with Auditor Manual and evidence locations prominent.

## Files and ownership

| Area            | Control Plane (this repo)                    | Trust Codex (cui-pilot/TRUST_CODEX)     |
|-----------------|-----------------------------------------------|------------------------------------------|
| Control catalog | `controls` + `codex_metadata`                 | manual-data.json, build_manual_data.py  |
| Governance list | `policies` + attestations                    | governance-manifest.json                 |
| Evidence runs   | evidence_metadata, optional run ingestion     | C:\evidence\, validation-report.json     |
| Export formats  | Export API, ZIP contents                     | Attestation markdown, governance JSON    |

This plan is the single roadmap for “pull Codex into the Control Plane” and can be updated as phases ship.
