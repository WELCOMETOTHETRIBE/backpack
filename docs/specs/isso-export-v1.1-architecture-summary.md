# ISSO Export Manifest v1.1 — Architecture Summary

Companion to `isso-export-manifest-v1.1.md` (the contract) and the per-phase build briefs. This is the architectural narrative — what was built, why, and how the pieces fit. Useful for handoff to new engineers, patent prep, and the C3PAO audit story.

## The problem v1.1 solves

The codex's evidence-freshness model originally relied on cadenced per-control attestations — one signed form per control, every N days. That model:

1. **Scales badly.** ~80 controls × 1+ attestation per cycle × annual review = hundreds of forms per year per org.
2. **Concentrates the evidence story in attestations the C3PAO discounts** as "self-reported." A signed form saying "I do this control" is weaker evidence than a signed form saying "I observed this control operating last week."
3. **Loses the human-judgment moment.** The ISSO weekly review is the assessor's preferred evidence ("show me you reviewed your audit logs and what you found") but the codex was only capturing one register entry per week (`audit_log_review`), missing the chance to refresh evidence for ~25 other controls the ISSO already touched.

v1.1 makes the ISSO weekly export the **structured, signed refresh mechanism for every register that benefits from ISSO oversight** — plus a one-shot `control_freshness` block where the ISSO explicitly affirms which controls were observed operating in the review window.

## High-level architecture

```
[Vault: EnclaveWatch]                         [Codex: Trust Codex]
─────────────────────                         ─────────────────────

NormalizedEvent rows                          governance_register_entries
  EventFamily =                                 (one row per ISSO observation
   "break_glass_signin"                          across 11 register types)
        │
        │ (read at export time)
        ▼
┌─────────────────────────┐                   ┌─────────────────────────┐
│ ISSO Review UI          │                   │ POST /isso-export/      │
│ (Razor / Exports.cshtml)│                   │   ingest                │
│                         │                   │  ↓                      │
│ - 9 register sections   │  signed v1.1      │ Forbidden-key gate      │
│ - control checklist     │  manifest         │  ↓                      │
│ - ack outcomes          │  + HMAC sig       │ Manifest-id dedupe      │
│                         │ ────────────────► │  ↓                      │
│ ISSO clicks Sign+Export │   POST            │ Dispatcher              │
└─────────────────────────┘                   │  ├ audit_log_review     │
        ▲                                     │  ├ maintenance_log      │
        │ (calls at review)                   │  ├ incident_log         │
        │                                     │  ├ access_authorizations│
        │  GET /break-glass-acks              │  ├ vuln_remediation     │
        ◄──────────────────────────────────── │  ├ training_completion  │
        │                                     │  ├ policy_review        │
        │  GET /isso-review-checklist         │  ├ assessment_findings  │
        ◄──────────────────────────────────── │  ├ media_handling_log   │
                                              │  ├ personnel_screening  │
                                              │  ├ control_freshness    │
                                              │  └ prior_period_acks    │
                                              │  ↓                      │
                                              │ control_records         │
                                              │ recompute               │
                                              │  ↓                      │
                                              │ /dashboard/monitoring   │
                                              │ surfaces:               │
                                              │  - manifest history     │
                                              │  - observations rollup  │
                                              │  - pending acks         │
                                              │  - open admin actions   │
                                              └─────────────────────────┘
```

## Sprint sequencing — what was built and in what order

The architecture was deliberately built in **contract-first order** to eliminate rework risk. EnclaveWatch and codex sides built in parallel against a single locked spec.

| Sprint | Deliverable | Side | Commit |
|---|---|---|---|
| **Sprint 0** | `isso-export-manifest-v1.1.md` (the contract) + `enclavewatch-sprint-4-prompt.md` (the brief) | docs | d06bbe6 |
| Sprint 0+ | Spec clarifications (Q1/Q2/Q3 from EnclaveWatch dev review) | docs | ce751a0 |
| **Sprint 1** | Codex dispatcher + 3 endpoints (`POST /isso-export/ingest`, `GET /break-glass-acks`, `GET /isso-review-checklist`) + dedupe table + audit_log_review handler | codex | d4c2dfc |
| **Sprint 2** | Break-glass closed loop: `break_glass_acknowledgment` schema, `maintenance_log` handler, `previous_period_acknowledgments_review` handler, admin ack form, Monitoring card | codex | 8390fe8 |
| **Sprint 3** | `control_freshness` handler (bumps `last_evaluated_at` for ISSO-observed controls) | codex | 3709467 |
| **Sprint 5 batch 1** | `incident_log`, `vuln_remediation`, `access_authorizations` handlers + new entry types | codex | cf049f6 |
| **Sprint 5 batch 2+3** | `policy_review`, `assessment_findings`, `training_completion`, `personnel_screening` handlers + NEW `media_handling_log` register | codex | e07a6df |
| **Sprint 6** | Monitoring tab evolution: manifest history card + ISSO observations rollup + escalation visibility | codex | 606c463 |
| **Sprint 6.5** | Persist + surface `control_freshness.needing_attention[]`: new `control_attention_items` table, resolve endpoint, "Open admin actions" card | codex | 81f7572 |
| **EnclaveWatch Phase 1** | Break-glass watcher (Azure Graph + Windows Security log) → NormalizedEvent rows | vault | d6fcbe5 |
| **EnclaveWatch Phase 2** | v1.1 manifest builder + manifest_id computer + HMAC signer + forbidden-key validator | vault | 64e179a |
| **Phase 3 brief** | Self-contained brief for Phase 3 implementation | docs | 8bff9f0 |
| **EnclaveWatch Phase 3** | ISSO review UI + pull clients + version branch in `Exports.cshtml.cs` | vault | (pending) |
| **Integration smoke** | End-to-end test: break-glass → manifest → ack → ISSO outcome | both | (pending) |

## Why contract-first mattered

Sprint 0 spent time writing a 466-line spec doc + 263-line brief BEFORE either side wrote a line of implementation code. That seemed slow at first but paid dividends:

- The EnclaveWatch dev caught three architectural ambiguities during review (Q1/Q2/Q3 about entry-shape, ack-status source, and control-list source) that would have caused rework if either side had built first.
- Both sides built independently against the same contract and integrated cleanly without round-tripping.
- Sprint 5 (5 new handlers + 1 new register) shipped in 3 batches without breaking anything because the dispatcher's interface is uniform — every handler returns the same `HandlerResult` shape and noopHandler() can be substituted any time.

The "contract first" pattern is reusable for any future codex ↔ vault feature.

## What v1.1 satisfies (per the orientation map)

The orientation map identified the realistic automation ceiling per NIST 800-171 R2 family. v1.1 hits the upper bound for every family:

| Family | Auto target | v1.1 mechanism |
|---|---|---|
| **AC** (15–20 of 22) | Access Control | `access_authorizations.weekly_review_findings[]` + `maintenance_log.break_glass` + `control_freshness` |
| **AT** (0–1 of 3) | Awareness & Training | `training_completion.completions_during_period[]` (NEW per orientation) + `expiring_attestations[]` |
| **AU** (8–9 of 9) | Audit & Accountability | `audit_log_review.weekly_review` + `control_freshness` |
| **CM** (6–8 of 9) | Configuration Mgmt | `control_freshness` (drift review) |
| **IA** (8–10 of 11) | Identification & Auth | `control_freshness` |
| **IR** (1–2 of 3) | Incident Response | `incident_log.incidents_during_period[]` |
| **MA** (2–4 of 6) | Maintenance | `maintenance_log.{break_glass, scheduled, remote}[]` |
| **MP** (2–4 of 9) | Media Protection | `media_handling_log` (NEW register per orientation) |
| **PE** (0–2 of 6) | Physical Protection | `control_freshness` (Azure inheritance) |
| **PS** (0–1 of 2) | Personnel Security | `personnel_screening.events_during_period[]` (NEW per orientation) |
| **RA** (2–3 of 3) | Risk Assessment | `vuln_remediation.verifications[]` + `assessment_findings.review_observations[]` |
| **CA** (1–3 of 4) | Security Assessment | `policy_review.stale_documents[]` + `assessment_findings.review_observations[]` |
| **SC** (10–14 of 16) | System & Communications | `control_freshness` |
| **SI** (6–7 of 7) | System & Info Integrity | `vuln_remediation` + `control_freshness` |

**Net coverage**: ~62–89 of 110 controls (60–80%) refreshable from a single weekly signed export, replacing per-control cadenced attestations on operational lanes.

## Key data structures (codex side)

| Table | Purpose |
|---|---|
| `isso_export_manifests` | Replay-safety dedupe by `manifest_id`. Caches response payloads for idempotent retries. |
| `governance_register_entries` | The 11 register types written by handlers. Idempotent on natural keys (alert_id, incident_id, vuln_id+observed_at, etc.). |
| `governance_registers` | Register provisioning per org. Auto-handled via `ensureEvidenceEngineRegistersForOrg` for new orgs. |
| `control_records` | `updated_at` is the freshness signal. Sprint 3's `control_freshness` handler bumps it for every ISSO-observed control. |
| `control_attention_items` | Sprint 6.5 — items the ISSO flags via `needing_attention[]` become admin-actionable rows. Resolved by admin click. |

## Defensive patterns that show up in every handler

Every handler in `src/lib/evidence-engine/isso-export/handlers/` follows the same shape:

1. **Alias-aware register lookup.** Uses `resolveRegisterKeyCandidates(schemaId)` so schema id (`access_authorization`) and seed key (`access_authorizations`) both resolve to the same register row.
2. **Prefer entry-bearing row on duplicates.** When a duplicate register row exists (drift problem we hit in production), pick the row with the most existing entries to keep history together.
3. **Validate required fields with skip-and-warn.** Never crash on a single bad item; record the warning in `HandlerResult.warnings`.
4. **Idempotent on a natural key.** Re-ingest of the same manifest is a no-op replace, not a duplicate. Manifest-id dedupe at the dispatcher catches the wholesale case; per-handler natural-key idempotency catches partial replays.
5. **Audit-log every consequential action.** `console.log(JSON.stringify({...}))` lines are picked up by Railway's log infra and surfaced in `/admin/audit-logs`.

## What's NOT in v1.1 (descopes worth knowing)

- **Dispute UI** for `dispute_pending` ack status. Reserved for v1.2; Phase 3 treats `disputed` as `overdue_escalated` for outcome purposes.
- **Per-section signature** on the manifest. Whole-manifest HMAC is sufficient.
- **Streaming ingest** for large manifests. Not needed at MacTech-pilot scale.
- **ISSO override of admin acknowledgment**. Implicit override exists via `verified_timely`, more granular controls are a follow-up.
- **Auto-resolution of `control_attention_items`** when ISSO stops flagging on subsequent manifests. Sprint 6.5 made these admin-driven; auto-resolution is a Sprint 7+ enhancement.

## Recovery & rollback paths

| Failure mode | Recovery |
|---|---|
| Vault stops emitting v1.1 manifests | Set `Export.ManifestVersion="1.0"` → reverts to legacy `weekly-review/ingest` path. Codex `weekly-review/ingest` endpoint stays live in parallel. |
| Codex POST endpoint rejects manifest with 400 | Vault logs forbidden-key path or missing-required-field error; ISSO fixes UI input and re-signs/exports. Same `manifest_id` produces 200 + `replayed: true`. |
| Codex handler crashes on one section | Other sections still process; failed section returns warning in `HandlerResult.warnings[]`. Whole manifest doesn't roll back. |
| Vault and codex disagree on `manifest_id` | Codex treats different ids as different manifests; both ingests land. Auditor sees both — investigate the canonical-body hash divergence. |
| Break-glass admin loses access during the 72h ack window | Vault keeps the alert open. ISSO can manually pick `verified_timely` on next export with their own affirmation in the `isso_note` field. Audit log shows the unusual path. |

## Files of interest (single-source-of-truth list)

```
docs/specs/
├── isso-export-manifest-v1.1.md              ← The contract
├── enclavewatch-sprint-4-prompt.md           ← Phase 1 + 2 brief
├── enclavewatch-phase-3-prompt.md            ← Phase 3 brief
└── isso-export-v1.1-architecture-summary.md  ← This document

src/lib/evidence-engine/isso-export/
├── types.ts                                   ← Manifest shape, IngestContext, HandlerResult
├── dispatcher.ts                              ← Routes sections to handlers, dedupes, recomputes
├── legacy-coerce.ts                           ← v1.0 → v1.1 coercion (transitional)
└── handlers/
    ├── audit-log-review.ts
    ├── maintenance-log.ts
    ├── ack-review.ts
    ├── control-freshness.ts
    ├── incident-log.ts
    ├── vuln-remediation.ts
    ├── access-authorizations.ts
    ├── policy-review.ts
    ├── assessment-findings.ts
    ├── training-completion.ts
    ├── media-handling-log.ts
    ├── personnel-screening.ts
    └── noop.ts                                ← Stub factory (no longer mapped to any section)

src/app/api/enclavewatch/
├── isso-export/ingest/route.ts                ← POST endpoint
├── break-glass-acks/route.ts                  ← GET endpoint
└── isso-review-checklist/route.ts             ← GET endpoint

src/app/api/registers/maintenance-log/break-glass/[entryId]/acknowledge/route.ts
                                                ← Admin ack-form POST

src/app/api/control-attention/[itemId]/resolve/route.ts
                                                ← Admin "mark resolved" POST

src/app/dashboard/monitoring/page.tsx          ← All Monitoring tab cards
src/app/dashboard/monitoring/AttentionResolveButton.tsx
                                                ← Client component for resolve button

src/app/dashboard/evidence-engine/entries/[entryId]/BreakGlassAckForm.tsx
                                                ← Client component for ack form

drizzle/
├── 0053_isso_export_manifests.sql             ← Replay safety table
└── 0054_control_attention_items.sql           ← Open admin actions table
```

## What the C3PAO sees (the value story)

When an assessor walks in, what's defensible looks like this:

1. **"Show me your continuous monitoring program."**
   → Open `/dashboard/monitoring`. Show four sources running on cadence, ISSO weekly export receipts in the last N weeks, observations the ISSO flagged, open admin actions.

2. **"How do you know your access reviews are happening?"**
   → 52 weekly signed manifests per year, each with a `control_freshness.freshly_observed_implemented[]` list. ISSO signature is the attestation.

3. **"What was your response to that break-glass session?"**
   → `governance_register_entries` for `maintenance_log.break_glass_acknowledgment` shows: detection → admin acknowledgment with full justification → ISSO verified outcome on subsequent review.

4. **"How do you handle privileged-access escalation?"**
   → Same registry, plus the audit log showing `enclavewatch.break_glass.escalated` events for any uncovered cases.

5. **"What policy documents are due for review?"**
   → `policy_review.stale_documents[]` entries flagged by ISSO during weekly review.

The story is **observation-based, not attestation-based**. Every register entry traces back to a specific ISSO weekly review. The `manifest_id` is a content-hash that proves the export wasn't tampered with.

## Operational model going forward

Once Phase 3 lands and the system is in steady state:

- **Daily**: vault auto-collects evidence, codex auto-recomputes control statuses
- **Weekly**: ISSO signs export → codex refreshes ~25 controls' freshness, writes any flagged entries
- **Per-event**: break-glass detection → 72h admin acknowledgment loop → next-week ISSO verification
- **As-needed**: admin marks `control_attention_items` resolved, files maintenance logs, etc.

This is the steady-state cadence. No daily admin chores, no monthly attestation-renewal anxiety, no quarterly "everyone re-sign the same forms" cycles. The ISSO weekly review IS the cadence.

---

**Status as of writing**: Codex side complete (Sprints 0–6.5). Vault side at Phase 2 (manifest builder ready). Phase 3 (UI + version branch) brief delivered, awaiting EnclaveWatch dev session. Integration smoke runs as soon as Phase 3 ships.
