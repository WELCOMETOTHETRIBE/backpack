# Control Adjudication Ecosystem — Cross-Repo Roadmap (Phases 6–12)

**Send this verbatim to the cross-repo Cowork agent.** This is the next-tier blueprint after Register-Automation v1.1 (Phases 1–5) shipped on 2026-05-06. Treat as a single multi-phase brief; phases are independently shippable but the dependency order matters.

---

## Vision (one sentence)

Turn the Codex + Vault into a system where **every CMMC control has a continuously-updated, signed, explainable status**, the SSP implementation statement is **auto-generated from observed register entries**, and an auditor can adjudicate a control in **minutes instead of weeks** by clicking one page per control.

The Phase 1–5 brief gave us the **evidence layer** — Pattern A closed loops on four high-value surfaces, §1 verbosity across all entries, a cross-reference graph. This brief layers the **adjudication engine** on top of that evidence: scoring, narrative generation, predictive risk lanes, threat correlation, auditor view, and auto-remediation.

---

## Where we are vs where we're going

### Today (post-v1.1)

- ~110 controls mapped to register requirements in `control_assessment_logic.v1.json` with `min_final_entries: 1` gating
- Weekly signed ISSO exports refresh ~25 controls' freshness via `control_freshness.freshly_observed_implemented[]`
- Four Pattern A closed loops detect → admin justify → ISSO verify (break-glass, privileged grants, config drift, defender alerts)
- Cross-reference graph lets an auditor navigate from any entry to its full chain
- `/admin/audit-logs` resolves cross-references with action labels and tone-coded events
- `<LifecycleStateBadge>` + `<EvidenceRefList>` give consistent visual treatment

### Where the system is "destined to be"

A C3PAO opens **one URL per control**:

> /auditor/3.1.5
>
> **Status: Satisfies** (95% confidence, scored 2026-05-06 02:45 UTC)
>
> **Implementation statement** (auto-generated, signed by ISSO weekly): "Privileged role grants for the MacTech CUI enclave are gated through Azure Activity Log → Phase 1 closed loop. Owner / Contributor / User Access Administrator role assignments fire a draft `privileged_grant_acknowledgment` entry within 5 minutes of the grant; the admin justifies with business purpose, expected duration, and sunset plan within 72 hours; the ISSO signs off on the next weekly review. In the last 90 days, 14 grants were detected, 14 justified within SLA, 14 ISSO-verified, 0 escalated. The break-glass account `emergency-bg-cui@…` is a separate Pattern A loop covering 3.1.7. Termination workflow auto-disables on offboarding within 1 business day."
>
> **Supporting evidence** (last 90 days, click any to drill):
>   - 14 `privileged_grant_acknowledgment` entries — all `lifecycle_state=isso_verified`
>   - 7 `break_glass_acknowledgment` entries — all `lifecycle_state=isso_verified`
>   - 3 `weekly_review_finding` entries — 3 admin-resolved, 0 escalated
>   - 7 weekly ISSO export manifests — all signed and ingested
>
> **Assessor scratchpad:** *(read-write for assessor, signed at assessment close)*

That's the experience. Today the auditor would have to assemble that themselves from log dumps and spreadsheets. The roadmap below builds the engine that produces it.

---

## §1. Phase queue

Ranked by leverage-to-effort ratio. Ship in dependency order — earlier phases produce the data that later phases score.

| Phase | Title | Pattern / approach | Effort | Depends on |
|---|---|---|---|---|
| **6** | Observed-Implementation Statements (OIS) | Auto-generate per-control narrative weekly from entries | 1.5 weeks | v1.1 |
| **7** | Control Adjudication Engine (CAE) | Per-control status + per-requirement breakdown + click-through | 2 weeks | 6 |
| **8** | Predictive Compliance Lanes | Per-control trajectory model; auto-POA&M on at-risk | 1.5 weeks | 7 |
| **9** | Cross-Evidence Correlation | Threat narratives joining across registers | 1 week | v1.1 (parallel to 6-8) |
| **10** | Auditor View Mode | Read-only chrome-stripped per-control URL family | 2 weeks | 6, 7 |
| **11** | Auto-Remediation Loops (Pattern D) | When the system can fix it, it does | 3 weeks | 7, 8 |
| **12** | External Attestation Bridge | C3PAO portal + DoD eMASS export | 3 weeks | 10 |

**Total:** ~14 dev-weeks. Realistic shippable stretch is **Phases 6 + 7 + 9 + 10 first** (~6.5 weeks); 8/11/12 are accelerators.

---

## §2. Phase 6 — Observed-Implementation Statements (OIS)

### Mission

For every control, the codex generates a one-paragraph implementation statement **derived from the past N days of register entries** for that control's `register_requirements`. Refreshed on every ISSO weekly export. Signed (by inheritance from the manifest hash). Replaces the static SSP narrative.

### Why this comes first

Every later phase depends on the codex knowing **how to summarize entries by control**. The implementation statement is that summarization function exposed as a primary artifact. CAE (Phase 7) consumes it. Auditor View (Phase 10) renders it. Predictive (Phase 8) tracks its freshness.

### Codex changes

#### 6a. New table `control_observed_implementations`

```
id, organization_id, control_id, period_start, period_end,
narrative (text), evidence_summary (jsonb — counts/lifecycle breakdown
per supporting register), generated_at, generated_from_manifest_id,
ssp_export_locked (bool — when true, narrative is frozen for an
ongoing assessment)
```

Indexes: `(organization_id, control_id, period_end DESC)`.

#### 6b. New service `src/lib/evidence-engine/adjudication/ois-generator.ts`

For each control, generate the narrative by:

1. Reading `control_assessment_logic.v1.json` register_requirements
2. For each required register, count entries by `entryType` × `lifecycle_state` in the period
3. Compose paragraph from a per-control template + counts (templates live in `src/data/cmmc/control_implementation_templates.v1.json` — new file)
4. Append "what's missing" sentence when `min_final_entries` not met or freshness window blown

Templates use `{{count.privileged_grant_acknowledgment.isso_verified}}` style placeholders so they survive entry-type changes.

#### 6c. Hook into manifest dispatcher

After ingest succeeds, re-generate OIS for every control in `controls_touched`. Fire async (don't block ingest response). Idempotent on `(organization_id, control_id, period_end)` — re-running same period replaces the row.

#### 6d. UI — `/dashboard/sctm/[controlId]/implementation`

Live-rendering page. Shows latest narrative, evidence breakdown table, period selector, freshness pill. "Lock for assessment" button (admin-only) freezes the narrative and creates a snapshot row.

### Acceptance criteria

- [ ] Schema migration applied
- [ ] Service generates OIS for all 110 controls in <30s per ingest
- [ ] Templates exist for the 30 controls with the highest evidence volume
- [ ] Other 80 controls fall back to a generic auto-generated paragraph
- [ ] UI page renders narrative + breakdown
- [ ] Manifest receipt audit log includes OIS regeneration event
- [ ] One paragraph in `isso-export-v1.1-architecture-summary.md`

---

## §3. Phase 7 — Control Adjudication Engine (CAE)

### Mission

For every control, the codex computes **{ status: satisfies | partial | gap | at_risk, confidence: 0..1, requirement_breakdown[] }**. Cached per period. Click-through to specific entries that drove each requirement.

### Codex changes

#### 7a. New service `src/lib/evidence-engine/adjudication/scorer.ts`

```typescript
type RequirementResult = {
  register_key: string;
  required_min: number;
  observed_final: number;
  observed_isso_verified: number;
  cadence_days_required: number;
  cadence_days_actual: number | null;
  satisfied: boolean;
  evidence_entry_ids: string[];   // up to 5 most recent
  gap_reason?: string;             // human-readable
};

type ControlAdjudication = {
  control_id: string;
  status: "satisfies" | "partial" | "gap" | "at_risk";
  confidence: number;
  requirements: RequirementResult[];
  computed_at: Date;
};
```

Status mapping:
- `satisfies`: all `requirements[].satisfied` AND cadence within `cadence_days_required`
- `partial`: ≥1 satisfied AND ≥1 not
- `gap`: 0 satisfied
- `at_risk`: all satisfied today BUT one or more requirements within 14d of cadence expiry

Confidence factors (rough): manifest signature freshness, ISSO weekly review cadence, evidence volume, lifecycle distribution skew.

#### 7b. New table `control_adjudication_snapshots`

`id, organization_id, control_id, computed_at, status, confidence, requirements_json, period_basis_manifest_id`. Indexed `(organization_id, control_id, computed_at DESC)`.

#### 7c. UI — adjudication card on `/dashboard/sctm` and per-control detail

Per-control row: status pill (satisfies=green, partial=amber, gap=red, at_risk=blue) + confidence bar + requirements expansion. Click into the per-control adjudication detail page that shows requirement breakdown with evidence click-through.

#### 7d. Manifest acknowledgement extension

Add to manifest receipt audit log: `controls_satisfies_count`, `controls_partial_count`, `controls_gap_count`, `controls_at_risk_count` so trend lines emerge over weeks.

### Acceptance criteria

- [ ] Service scores all 110 controls in <10s
- [ ] Status pill renders on /dashboard/sctm
- [ ] Detail page shows per-requirement breakdown with click-through
- [ ] Trend chart on Monitoring tab: status counts over last 12 weeks
- [ ] Adjudication snapshot persisted per ISSO weekly export

---

## §4. Phase 8 — Predictive Compliance Lanes

### Mission

For controls today scored `satisfies`, project: **"how many days until this fails?"** Surface "at-risk in 7 days" / "at-risk in 30 days" lanes on Monitoring. Auto-create POA&M items for projected failures so the operator has lead time.

### Codex changes

#### 8a. Risk model `src/lib/evidence-engine/adjudication/risk-model.ts`

For each `requirement` in each control:
- If `cadence_days_actual` exists, project days-until-stale = `cadence_days_required - cadence_days_actual`
- If draft acks past 72h SLA exist, project escalation in `(72 - draft_age_hours)` hours
- If attestations expire in <30d, project at-risk on expiry date

Output: per-control `projected_failure_at: Date | null, why: string`.

#### 8b. Monitoring tab three-lane card

| Lane | Threshold | Default action |
|---|---|---|
| Already failing | status ∈ {gap, partial} | POA&M auto-opened |
| At risk in 7 days | projected_failure_at within 7d | Admin notification + Monitoring banner |
| At risk in 30 days | projected_failure_at within 30d | Quiet log entry only |

#### 8c. Auto-POA&M intake

When a control flips to `gap` and no open POA&M exists for it, auto-create one with:
- `weakness_description` = the OIS narrative's "what's missing" sentence (from Phase 6)
- `target_completion_date` = configured grace (default 30d)
- `lifecycle_state` = `draft`, `actor_user` = "system", `event_classification` = "auto_poam"

The auto-POA&M is just another Pattern A entry — admin signs the remediation plan; ISSO closes on next weekly.

### Acceptance criteria

- [ ] Risk model scores in <5s
- [ ] Monitoring three-lane card live
- [ ] Auto-POA&M creates entries with §1 verbosity
- [ ] No more than 1 auto-POA&M per (control_id, organization_id) at a time

---

## §5. Phase 9 — Cross-Evidence Correlation (Threat Narratives)

### Mission

Detect when **multiple register entries tell a single threat story** and surface the narrative on its own card. Examples:

- Break-glass sign-in + privileged role grant + Defender alert in same hour from same actor → "credential compromise narrative"
- Configuration drift on `services\*` + Defender alert categorized `privilege_escalation_attempt` → "tampering narrative"
- Weekly review finding `dormant_account` + privileged grant on same UPN → "stale-privilege narrative"

The auditor shouldn't have to assemble these by hand. The system should.

### Codex changes

#### 9a. New service `src/lib/evidence-engine/correlation/threat-narratives.ts`

Hybrid approach:
- **Rules** for the well-known patterns (above) — encoded in `src/data/cmmc/threat_narrative_rules.v1.json`
- **Time + actor + system join** for entries within ±60min that share at least 2 of {actor_user, system, scope_arm}

#### 9b. New table `threat_narratives`

`id, organization_id, narrative_type, opened_at, last_observed_at, status (open/closed/false_positive), confidence, related_entry_ids (jsonb), summary (text)`.

#### 9c. UI

- Monitoring tab "Active threat narratives" card at the top
- Per-narrative detail page with timeline of contributing entries, response checklist, close-out button (admin/ISSO sign-off — Pattern A loop again)

#### 9d. Close-out flow

Same observe-justify-verify shape: admin signs investigation outcome; ISSO verifies on weekly review. Narrative becomes its own auditor-defensible artifact.

### Acceptance criteria

- [ ] 5 hand-coded rules cover the common patterns
- [ ] Time/actor/system join finds related entries
- [ ] Active narratives card on Monitoring
- [ ] Narrative detail page with response checklist
- [ ] Audit log chain captures narrative open/close events

---

## §6. Phase 10 — Auditor View Mode

### Mission

A read-only, chrome-stripped, per-control URL the C3PAO uses during assessment. Authentication: scoped read-only role + IP allowlist (`feat/auditor-ip-allowlist` branch already has the allowlist; needs role).

### Codex changes

#### 10a. New route family `/auditor/[controlId]`

Renders, in order:
1. Practice statement (from `cmmc_practices.v1.json`)
2. Phase 6 implementation narrative (latest, locked if assessment in progress)
3. Phase 7 adjudication status pill + confidence + requirements breakdown
4. Phase 9 active narratives that touch this control
5. Evidence list — entries from past 90d grouped by entry_type, click-through to entry detail (also auditor-mode)
6. Assessor scratchpad (textarea, autosaves, signed at assessment close)

#### 10b. Auditor-mode entry detail

Existing entry detail page conditionally strips: edit forms, FinalizeButton, all admin actions. Shows: summary, fields, evidence_refs (read-only), Related events (read-only), timeline.

#### 10c. Auth + IP allowlist

- New role: `Auditor` (read-only, can't write)
- Pull IP allowlist from `feat/auditor-ip-allowlist` branch onto main
- Auditor-scoped session has no write paths
- Audit-log every auditor page view (so we have evidence the assessor reviewed each control)

#### 10d. Assessment session lifecycle

- `assessments` table: `assessment_id, organization_id, opened_at, opened_by, closed_at, closed_by, signed_off_by, narrative_lock_started_at`
- "Open assessment" admin action locks all OIS narratives at current period
- "Close assessment" emits a signed assessment-package manifest (the C3PAO leaves with a tamper-evident bundle)

### Acceptance criteria

- [ ] /auditor/[controlId] renders for all 110 controls
- [ ] Read-only role enforced
- [ ] IP allowlist gates the route family
- [ ] Assessor scratchpad autosaves + signs at close
- [ ] Audit log captures every auditor page view
- [ ] Assessment-package manifest exports cleanly

---

## §7. Phase 11 — Auto-Remediation Loops (Pattern D)

### Mission

When the system can fix something, it does — with the same observe-justify-verify chain so the action is auditor-defensible.

Examples:
- Privileged grant past `sunset_plan.expected_duration_days` → auto-revoke (vault calls Azure RBAC API), write `auto_revocation` entry, admin can dispute
- Stale weekly review (>14d since last) → auto-page ISSO + create `attention_item`
- Defender alert past 24h SLA → auto-escalate to ISSO with severity bumped
- Drift event matching a known-safe pattern (e.g., Windows Update) → auto-justify with `false_positive_investigated`

### Codex + vault changes (per surface)

This is the framework, not a single surface. First surface: privileged-grant auto-expiry (highest leverage, lowest risk). Vault gets a `RemediationOrchestrator` worker that polls the codex for actionable items and executes them via Azure SDK calls. Codex writes `pattern_d_remediation_record` entries.

### Acceptance criteria

- [ ] First Pattern D surface (privileged-grant auto-expiry) shipped
- [ ] Pattern D entry type schema with §1 verbosity
- [ ] Admin dispute flow (5-day grace before auto-action)
- [ ] Auto-action audit log chain visible

---

## §8. Phase 12 — External Attestation Bridge

### Mission

Auto-export to DoD eMASS or other external GRC. Share auditor view with C3PAO via read-only token. Push notification to DoD ATO process when control state changes.

(Detailed brief deferred until Phases 6–10 ship — exact integration points depend on what eMASS exports look like at the time, and which C3PAO is engaged.)

---

## §9. What this brief is NOT

- Not a rebuild — every phase reuses Phase 1–5 plumbing (handlers, dispatcher, registers, audit log, evidence_refs)
- Not a single big bang — each phase is independently shippable and provides standalone value
- Not a UI redesign — adds new pages and surfaces, doesn't change existing ones except where data flows through

---

## §10. Sequencing rationale + recommended first move

### Why this order

- **Phase 6 first** because every later phase needs it. CAE scores from observed implementations; predictive tracks them; auditor view renders them; auto-remediation triggers off scoring.
- **Phase 7 right after** because OIS without scoring is a narrative without a verdict — it's prose, not a control state.
- **Phase 9 in parallel** because correlation is independent of scoring; ship it whenever the team has bandwidth.
- **Phase 10 after 6+7** because auditor view assembles the OIS + adjudication artifacts produced by the prior phases.
- **Phase 8 + 11** are accelerators — they multiply value but aren't on the critical path.
- **Phase 12 last** because it depends on a stable view to export from.

### Recommended first move (this week)

**Land Phase 6 as a single 7-day sprint.** Three deliverables, all small:

1. Schema migration `0058_control_observed_implementations.sql` (~30 LOC)
2. Service `src/lib/evidence-engine/adjudication/ois-generator.ts` (~400 LOC)
3. Templates JSON `src/data/cmmc/control_implementation_templates.v1.json` for the top 10 controls by evidence volume (~200 LOC)
4. Hook into dispatcher to regenerate on ingest (~30 LOC)
5. Bare-bones UI page `/dashboard/sctm/[controlId]/implementation` (~150 LOC)

After Phase 6 lands, **the SSP becomes a live document** — the highest-leverage single change in the whole roadmap. Everything after compounds on it.

### Coordination checkpoints

- After Phase 6: walk through SSP for 5 controls. Confirm narrative quality. Tune templates.
- After Phase 7: confirm scoring logic against a known-good control state on a real org.
- Before Phase 10: walk through the auditor view with the C3PAO before the assessment.
- After Phase 11 (per surface): one-week shakedown before declaring the auto-action stable.

---

## §11. The single most important rule

**Compute, don't author.** Every output of the adjudication engine — OIS narratives, control statuses, threat narratives, predictions, auto-remediation actions — is **derived from observed entries**, never written by hand. The whole point is to eliminate "I wrote a doc that says I do this" in favor of "the system observed me doing this and wrote the doc."

If you find yourself adding a hand-authored field that the engine can't derive, push back: either the engine is missing a signal (extend it) or the field doesn't belong (drop it).

This is the same principle that drove §1 verbosity. Same principle, scaled up.

---

**End of brief.** Replies, contract clarifications, scope changes → back to Patrick. Don't make scope decisions unilaterally.
