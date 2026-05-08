# Register Automation + Auditor-Defensible Entry Hardening — Cross-Repo Blueprint

**Send this verbatim to the cross-repo Cowork agent.** It has both Codex (`codex.mactechsolutionsllc.com`) and EnclaveWatch (`vault-001.mactechsolutionsllc.com`) repos checked out. This is a single multi-phase brief; treat each phase as an independently shippable unit.

---

## Mission

The break-glass acknowledgment closed-loop is proven end-to-end. The next phase replicates that pattern across additional high-value detection surfaces and **hardens every register entry to be auditor-defensible** — meaning a C3PAO can read any entry in isolation and reconstruct the full story without follow-up questions.

Three deliverables, in order:

1. **Three new closed-loop replications** for the highest-leverage detection surfaces (Privileged Role Grants, Configuration Drift, Critical Defender Alerts)
2. **Verbosity hardening pass** across all 11 existing v1.1 register handlers — every entry gets the full auditor-defensible field set documented in §2 below
3. **Cross-reference graph** — each entry links to related entries (manifest_id, audit_log id, parent/child entries) so the auditor can navigate the chain

You're authorized to ship across both repos in tandem. Use the contract-first pattern from prior sprints: define the manifest sections + register schemas before either side writes code.

---

## §1. Auditor-defensible entry standard (the hard requirement)

Every register entry written by ISSO export handlers MUST contain answers to these 11 fields. If a field is N/A for a specific entry type, populate it with `null` — never omit. Auditors notice missing keys.

| # | Field | What it answers | Always required? |
|---|---|---|---|
| 1 | `actor_*` | Who triggered/performed the event (UPN, role, identity_type) | Yes |
| 2 | `event_type` + `event_classification` | What specific action/event (per-register enum) | Yes |
| 3 | `detected_at`, `occurred_at`, `signed_at`, `verified_at` | All four time anchors (when detected by system, when actually happened, when admin signed, when ISSO verified) | Yes (null if not yet at that lifecycle state) |
| 4 | `system`, `scope`, `vault_id`, `boundary_id` | Where the event occurred | Yes |
| 5 | `business_justification` | Why (free text from admin/ISSO) | Required to finalize |
| 6 | `detection_method` | How (auto-detected vs ISSO-observed vs admin-attested), with detection source | Yes |
| 7 | `outcome` + `actions_taken` | What was decided / done | Required to finalize |
| 8 | `verified_by` + `verification_note` | Who verified, with what comment | Required at ISSO-verified lifecycle state |
| 9 | `evidence_refs[]` | Array of cross-references: manifest_id, audit_log_id, related_entry_ids, ticket_url, screenshot_hashes, etc. | Yes (can be empty array) |
| 10 | `lifecycle_state` | `draft \| admin_signed \| isso_verified \| escalated \| disputed \| resolved \| void` | Yes |
| 11 | `provenance` | The signed manifest_id that created this entry + the EnclaveWatch run_id that detected it | Yes for auto-detected; null for manual |

**This standard applies to NEW handlers AND retroactively to existing ones.** Phase 4 of this brief is the verbosity migration — touch every existing handler, expand the entry shape, add backfill SQL where needed.

**Concrete shape of `evidence_refs[]`:**
```json
[
  { "type": "manifest_id", "value": "sha256-...", "label": "Source manifest" },
  { "type": "audit_log_id", "value": "uuid-...", "label": "Detection audit event" },
  { "type": "related_entry_id", "value": "uuid-...", "label": "Parent role grant" },
  { "type": "ticket_url", "value": "https://...", "label": "JIRA-1234" },
  { "type": "evidence_file_hash", "value": "sha256-...", "label": "Screenshot SHA-256" }
]
```

The codex's existing `governance_register_entries` JSONB column accommodates this without schema changes. UI components can render `evidence_refs[]` as click-through links.

---

## §2. Pattern catalog (reusable building blocks)

Three patterns. Every closed-loop replication uses one of them. Don't invent new patterns.

### Pattern A — Detect → Admin justify → ISSO verify (the break-glass pattern)

**When to use:** event was auto-detected by the vault and admin needs to provide business justification within a deadline (default 72h).

**Manifest section:** carries detection metadata + alert_id (deterministic from source event ID).

**Codex flow:**
- Insert as `status=draft, lifecycle_state=draft`
- Surface in Monitoring tab "Pending acknowledgments" card
- Admin opens entry detail, fills justification form, signs → `lifecycle_state=admin_signed, status=final`
- ISSO verifies on next weekly review → `lifecycle_state=isso_verified` + `verified_by`/`verified_at`/`verification_note`

**Reference implementation:** `maintenance_log.break_glass_acknowledgment` — already shipped end-to-end.

### Pattern B — Detect → Auto-record → ISSO sample-verify (lighter touch)

**When to use:** event was auto-detected and is high-volume (e.g., daily flow log entries). Admin justification per-event is impractical; ISSO samples a subset during weekly review and acks each batch.

**Manifest section:** carries event batch + ISSO's sample-verification result.

**Codex flow:**
- Insert as `status=final, lifecycle_state=auto_recorded`
- ISSO weekly review optionally upgrades a sample to `lifecycle_state=isso_verified`
- Outliers (configurable severity threshold) flip back to Pattern A — admin must justify

**Reference implementation:** `vuln_remediation.verifications` is the closest existing example — every weekly review confirms a batch.

### Pattern C — ISSO-observed → Admin remediates (reverse direction)

**When to use:** ISSO observes something during weekly review that admin didn't know about; ISSO files the entry, admin confirms remediation.

**Manifest section:** ISSO populates during weekly review (the cross-cutting `freshly_observed_implemented[]` and `needing_attention[]` patterns are versions of this).

**Codex flow:**
- Insert as `status=draft, lifecycle_state=isso_flagged`
- Surface in Monitoring tab "Open admin actions" card
- Admin marks resolved with remediation note → `lifecycle_state=admin_resolved, status=final`

**Reference implementation:** `control_attention_items` (Sprint 6.5).

---

## §3. Phase queue

Ranked by leverage-to-effort ratio. Ship in order; don't parallelize phases.

| Phase | Title | Pattern | Effort | Backs |
|---|---|---|---|---|
| **1** | Privileged Role Grants | A | 2 days | 3.1.5, 3.1.6, 3.10.6 |
| **2** | Configuration Drift Outside change_log | A | 3 days | 3.4.1, 3.4.2, 3.4.3 |
| **3** | Critical Defender Alerts | A | 1.5 days | 3.14.2, 3.14.6 |
| **4** | Verbosity hardening pass | n/a (refactor) | 2 days | all existing controls (cross-cutting) |
| **5** | Cross-reference graph + Monitoring UI evolution | n/a | 2 days | all existing controls (cross-cutting) |

**Total:** ~10.5 days of focused build across both repos.

---

## §4. Phase 1: Privileged Role Grants

### Detection (vault side — already done)

EnclaveWatch's `azure_role_assignment_events` cadence already fires daily, calling Microsoft Graph for role assignment writes scoped to the vault's resource group. Currently posts to `/api/registers/access-authorizations/bulk-upsert` and the codex inserts each grant as `status=final` immediately. **No vault-side work for Phase 1.**

### Codex changes (Phase 1 scope)

#### 1a. Distinguish privileged vs non-privileged grants at insert time

In `src/app/api/registers/access-authorizations/bulk-upsert/route.ts`:

The existing `mapAzureRoleToSchemaEnum()` helper categorizes Azure roles. The categorization `"privileged_admin"` (Owner / Contributor / User Access Administrator) is what we gate on.

Change: when `schemaRole === "privileged_admin"`, insert as `status=draft, lifecycle_state=draft` instead of `status=final`. Non-privileged grants keep current behavior (auto-final, lighter ack).

#### 1b. Schema additions to `register_entry_schemas.v1.json`

Add new entry type to the `access_authorization` register:

```json
{
  "type": "privileged_grant_acknowledgment",
  "short_help": "Auto-detected privileged role grant awaiting admin justification (intended business purpose, sunset plan, expected duration). Pattern A — admin justifies within 72h or alert escalates to ISSO.",
  "required_at_finalize": [
    "actor_user", "actor_user_id",
    "event_type", "event_classification",
    "detected_at", "occurred_at", "signed_at",
    "system", "scope_arm", "vault_id", "boundary_id",
    "business_justification",
    "detection_method", "detection_source",
    "outcome", "actions_taken",
    "evidence_refs",
    "lifecycle_state",
    "provenance"
  ],
  "required_at_isso_verified": [
    "verified_by", "verified_at", "verification_note"
  ],
  "optional": ["expected_duration_days", "sunset_plan", "ticket_url", "notes"],
  "enums": {
    "event_type": ["role_grant", "role_modify", "role_extend"],
    "event_classification": ["privileged_admin", "privileged_security", "privileged_billing"],
    "detection_method": ["azure_activity_log", "manual_attestation"],
    "outcome": ["approved", "approved_with_conditions", "rolled_back", "investigating"],
    "lifecycle_state": ["draft", "admin_signed", "isso_verified", "escalated", "disputed", "resolved", "void"]
  }
}
```

#### 1c. Admin justification form

Mirror `BreakGlassAckForm.tsx`. Lives at `/dashboard/registers/access-authorization/[entryId]/justify` (new client component). Pre-fills detection metadata as read-only context. Required fields per `required_at_finalize` minus the auto-populated ones:

- `business_justification` — free text (≥ 50 chars)
- `expected_duration_days` — numeric
- `sunset_plan` — free text describing how/when access will be revoked
- `outcome` — dropdown: approved / approved_with_conditions / rolled_back / investigating
- `actions_taken` — free text
- `ticket_url` — optional

POST to new endpoint `/api/registers/access-authorization/[entryId]/justify`.

#### 1d. Endpoint + Monitoring tab card

- New POST endpoint mirrors break-glass-ack: session+role gated, validates required fields, writes audit log event `enclavewatch.privileged_grant.admin_justified`
- Monitoring tab gains "Pending privileged-grant justifications" card identical pattern to the existing break-glass card
- 72h escalation: same shape — overdue items get critical-severity attention entry

#### 1e. ISSO verification path

Use existing `previous_period_acknowledgments_review` handler. Vault-side ISSO review UI already pulls from `/break-glass-acks` — extend the codex GET endpoint to ALSO surface privileged-grant justifications. New endpoint `GET /api/enclavewatch/privileged-grant-acks` mirrors the break-glass one.

ISSO picks `verified_timely | overdue_escalated | dispute_pending`. Same outcomes, same finalization logic.

### Phase 1 acceptance criteria

- [ ] New `privileged_grant_acknowledgment` entry type in schema
- [ ] `bulk-upsert` route differentiates privileged vs non-privileged at insert
- [ ] Admin justification form renders, validates, signs
- [ ] Monitoring tab shows pending grants with 72h countdown
- [ ] ISSO verification path round-trips through next weekly export
- [ ] Audit-log events fire for: detected, admin_justified, isso_verified, escalated
- [ ] Backfill: any existing privileged grants in `access_authorizations` register that pre-date Phase 1 land as `lifecycle_state=auto_recorded` (Pattern B) — no retroactive admin justification required, but flagged on a "legacy entries" view

---

## §5. Phase 2: Configuration Drift Outside change_log

### Detection (vault side — new work)

EnclaveWatch already collects Sysmon events (channels: Sysmon/Operational, plus Security log). Sysmon Event ID 11 = file create, 12-14 = registry writes. Add a new collector:

`ConfigurationDriftCollector` (new C# class):
- Subscribes to Sysmon channel
- Filters to events on baseline-protected paths:
  - `C:\Windows\System32\drivers\etc\hosts`
  - `HKLM\SYSTEM\CurrentControlSet\Services\*` (any value change)
  - `C:\ProgramData\EnclaveWatch\*` (self-protection)
  - Configurable additional paths via `ConfigurationDrift:WatchPaths` in appsettings
- Cross-references each event against the `change_log` register: pulls last 14 days of `change_logged` entries via codex `GET /api/registers/change-log/recent` (new endpoint), checks if the path/key matches any logged change
- Drift = event NOT matched to a change_log entry within ±60 minutes

Emits `NormalizedEvent` with `EventFamily = "configuration_drift"`. Same `Json` shape as break-glass: deterministic alert_id from Sysmon event ID, includes path, change_type, actor.

### Codex changes

Same shape as Phase 1: new entry type on a new register `change_drift_log` (use existing `change_log` register schema slot? — no, new register because semantics differ; change_log = intentional, change_drift_log = unexplained).

Provision the new `change_drift_log` register:
- Schema: `register_entry_schemas.v1.json` gets new register block
- Seed data: `seed-data.ts` gets new `REGISTER_DEFINITIONS` entry
- Migration: SQL to insert the register row for MacTech (idempotent, like media_handling_log was)

Manifest section: `registers.change_drift_log.drift_observations[]`.

Codex handler: writes draft entries; admin justifies "intended (ticket #X)" or "investigated, false positive."

Backfill: none (this is a new detection surface).

### Phase 2 acceptance criteria

- [ ] `ConfigurationDriftCollector` deployed on vault, emitting NormalizedEvent rows
- [ ] New `change_drift_log` register provisioned for MacTech and seeded for new orgs
- [ ] New manifest section `registers.change_drift_log.drift_observations[]` carries events
- [ ] Codex handler writes drafts, admin justifies, ISSO verifies — same flow as Phase 1
- [ ] False-positive rate during 1-week shakedown period: log it, tune `WatchPaths` if > 5/day for routine system activity

---

## §6. Phase 3: Critical Defender Alerts

### Detection (vault side — new work)

EnclaveWatch's existing `mdvm_scan` collector pulls Defender Vulnerability Management findings, but doesn't surface real-time Defender for Endpoint alerts. Add:

`DefenderCriticalAlertCollector`:
- Polls Microsoft Graph `security/alerts_v2` filtered to `severity in (high, critical)` and `assignedTo = (mdmDeviceId in vault scope)`
- Cadence: every 10 minutes
- Emits NormalizedEvent with `EventFamily = "defender_critical_alert"`
- Deterministic alert_id from `defender-{alert.id}`

### Codex changes

Same shape as Phase 1. New entry type on existing `incident_log` register (don't create a new register — Defender alerts ARE incidents):

```json
{
  "type": "defender_alert_acknowledgment",
  "required_at_finalize": [
    "actor_alert_id", "actor_alert_title",
    "event_type", "event_classification",
    "detected_at", "occurred_at", "signed_at",
    "affected_assets", "vault_id", "boundary_id",
    "business_justification", "detection_method",
    "outcome", "actions_taken",
    "evidence_refs", "lifecycle_state", "provenance"
  ],
  "enums": {
    "event_type": ["malware_detected", "credential_theft_attempt", "privilege_escalation_attempt", "lateral_movement_attempt", "data_exfiltration_attempt", "other"],
    "outcome": ["true_positive_remediated", "true_positive_in_progress", "false_positive_investigated", "risk_accepted"]
  }
}
```

### Phase 3 acceptance criteria

- [ ] `DefenderCriticalAlertCollector` deployed, polling Graph every 10 min
- [ ] Manifest section `registers.incident_log.defender_alerts[]` (new sub-section)
- [ ] Codex handler writes drafts, admin acks investigation outcome, ISSO verifies
- [ ] Any alert > 24h without admin acknowledgment fires `severity=critical` to Monitoring + escalates
- [ ] Audit-log event chain: `defender_alert.detected → defender_alert.admin_acknowledged → defender_alert.isso_verified`

---

## §7. Phase 4: Verbosity hardening pass (cross-cutting refactor)

This is the unsexy but important phase. **Every existing handler from Sprints 1–5 gets a verbosity upgrade** so existing entries match the auditor-defensible standard from §1.

### Per-handler audit checklist

For each of the 11 existing handlers in `src/lib/evidence-engine/isso-export/handlers/`:

- [ ] Audit current `entryData` shape vs §1's 11-field standard
- [ ] Identify missing fields
- [ ] Update handler to populate missing fields on new writes
- [ ] Write a small backfill migration that populates `lifecycle_state` and `evidence_refs[]` on existing entries (best-effort; entries pre-dating the fields get `lifecycle_state="auto_recorded_legacy", evidence_refs=[]`)

### Specific gaps to close

| Handler | Missing in current entries |
|---|---|
| `audit_log_review` | `evidence_refs[]`, `lifecycle_state`, `actor_*` (just has `reviewed_by` string) |
| `maintenance_log` (break-glass) | `evidence_refs[]`, `lifecycle_state` (status is enough but lifecycle is more granular), `actor_user_id` (have UPN, not Entra object id) |
| `incident_log` | `actor_*` of detector, `evidence_refs[]`, `lifecycle_state`, `verified_by` |
| `vuln_remediation` | `evidence_refs[]` (especially: link to `vulnerability_detected` parent entry), `lifecycle_state` |
| `access_authorizations` weekly_review_finding | `evidence_refs[]`, `lifecycle_state`, `outcome` (currently has `recommended_action` — rename for consistency) |
| `policy_review` stale_document_flag | `evidence_refs[]` (especially link to the policy doc itself), `lifecycle_state` |
| `assessment_findings` review_observation | `evidence_refs[]`, `lifecycle_state`, `verified_by` |
| `training_completion` | `evidence_refs[]` (LMS receipt URL, certificate hash), `lifecycle_state` |
| `media_handling_log` | `evidence_refs[]` (chain-of-custody), `lifecycle_state` |
| `personnel_screening` | `evidence_refs[]` (HR record reference), `lifecycle_state` |
| `control_freshness` | already minimal by design — control_records.updated_at IS the entry; skip this one |

### One backfill migration covers all of them

```sql
-- 0055_register_entry_verbosity_backfill.sql

-- For every existing register entry that doesn't have lifecycle_state in its
-- entry_data, default it based on the entry's status column. This makes
-- legacy entries queryable by lifecycle without forcing a re-export.
UPDATE governance_register_entries
SET entry_data = entry_data || jsonb_build_object(
  'lifecycle_state', CASE
    WHEN status = 'final' AND entry_data ? 'isso_verified_at' THEN 'isso_verified'
    WHEN status = 'final' THEN 'admin_signed'
    WHEN status = 'draft' THEN 'draft'
    ELSE 'auto_recorded_legacy'
  END,
  'evidence_refs', COALESCE(entry_data->'evidence_refs', '[]'::jsonb)
)
WHERE NOT (entry_data ? 'lifecycle_state');
```

### Phase 4 acceptance criteria

- [ ] Every handler updated to write the §1 standard fields
- [ ] Backfill migration applied to MacTech prod and validated
- [ ] No regression: existing UI surfaces (Monitoring tab, register list, entry detail) still render correctly
- [ ] New entries written post-migration have ALL §1 fields populated

---

## §8. Phase 5: Cross-reference graph + Monitoring UI evolution

The auditor-defensibility story is incomplete without **navigation between related entries**. An auditor seeing a `break_glass_acknowledgment` entry should be able to click through to:

- The original Azure signIn audit event
- The audit_log row for the detection
- The audit_log row for the admin signature
- The audit_log row for the ISSO verification
- The manifest_id receipt that delivered each
- Any related `privileged_grant_acknowledgment` entries (e.g., if the break-glass session granted itself a privileged role, surface that link)

### Codex changes

#### 5a. New API endpoint: cross-reference resolver

`GET /api/registers/[registerKey]/[entryId]/cross-references`

Returns:
```json
{
  "entry_id": "uuid-...",
  "alert_id": "bg-azure-...",
  "manifest_id": "sha256-...",
  "audit_log_chain": [
    { "id": "uuid", "action": "enclavewatch.break_glass.signin_detected", "occurred_at": "...", "actor": "..." },
    { "id": "uuid", "action": "enclavewatch.break_glass.admin_acknowledged", "occurred_at": "...", "actor": "Patrick" },
    { "id": "uuid", "action": "enclavewatch.break_glass.ack_review_applied", "occurred_at": "...", "actor": "ISSO" }
  ],
  "related_entries": [
    { "register_key": "access_authorizations", "entry_id": "uuid", "label": "Privileged grant created during this session" }
  ],
  "manifest_history": [
    { "manifest_id": "sha256-...", "received_at": "...", "section": "maintenance_log" }
  ]
}
```

#### 5b. Entry detail page enhancement

Update `src/app/dashboard/evidence-engine/entries/[entryId]/page.tsx` to render a "Related events" section showing the audit-log chain and related entries. Each row click-throughs to the underlying record.

#### 5c. Monitoring tab roll-up

The "Recent ISSO weekly exports" card on Monitoring already shows manifest_id + sections + controls touched. Enhance: each manifest row click-throughs to a manifest detail page showing every entry written by that manifest (cross-referenced via `entry_data->>'manifest_id'`).

#### 5d. `evidence_refs[]` rendering helper

Reusable React component `<EvidenceRefList refs={...} />`:
- Renders each ref as a click-through link by `type`
- `manifest_id` → link to manifest detail
- `audit_log_id` → link to /admin/audit-logs filtered to that ID
- `related_entry_id` → link to the related entry's detail page
- `ticket_url` → external link
- `evidence_file_hash` → renders hash + verify-button

### Phase 5 acceptance criteria

- [ ] Cross-reference endpoint live and returns chain for any entry id
- [ ] Entry detail page renders Related events section with click-throughs
- [ ] Monitoring tab manifest rows are click-through to manifest detail page
- [ ] `<EvidenceRefList>` component reusable across all entry types

---

## §9. What's NOT in this brief (descopes)

- **Tier B unbuilt UI sections** (stale policy form, review observations form, personnel events form) — still deferred. If a customer triggers the need, it's a separate brief.
- **Tier C integrations** (LMS, M365 admin audit, physical security) — still deferred, big-ticket integrations.
- **Auditor view mode** in the codex (read-only chrome-stripped view) — separate brief, separate effort. Worth doing but doesn't belong here.
- **Dispute UI for break-glass acks** — reserved for v1.2.
- **Auto-resolve `control_attention_items` when ISSO stops flagging** — small enhancement, not in scope here.
- **Defender alert correlation across multiple alerts** (e.g., merging related alerts) — out of scope; each alert acked independently.

---

## §10. Coordination + sequencing

### Branch hygiene

- Each phase ships on its own branch. Don't bundle phases.
- Merge to `main` after each phase passes its acceptance criteria.
- Cross-repo phases (1, 2, 3) coordinate timing: codex changes can ship first, vault changes follow once codex contract is live in production. The codex's existing "warn-and-no-op on unknown sections" semantics mean vault-side delays don't break codex.

### Per-phase definition of done

Every phase ends with:
1. Acceptance criteria checked off
2. Cross-platform build + test suite green on EnclaveWatch side
3. `npx tsc --noEmit` + `npx next build` green on codex side
4. Live smoke against pilot codex (POST a manifest, verify response shape)
5. Audit-log chain visible in `/admin/audit-logs` for the new event types
6. One paragraph added to `docs/specs/isso-export-v1.1-architecture-summary.md` describing what landed
7. Patrick screenshare-confirms the Monitoring tab renders the new card correctly

### Coordination checkpoints

- **After Phase 1**: confirm Privileged Role Grant pattern works end-to-end on a real grant. If it works cleanly, replicate the pattern for Phase 2/3.
- **After Phase 3**: pause for a 1-week shakedown — accumulate enough real signal to spot false-positive rates and tune detection cadences.
- **Before Phase 4**: codex-side migration must be tested on a copy of production data before being applied to the live DB.
- **After Phase 5**: full end-to-end auditor walkthrough — Patrick role-plays the C3PAO, navigates from a Monitoring-tab alert to every related entry/audit-log row to verify the chain holds.

---

## §11. The single most important rule

**Verbosity is a feature, not bloat.** Every entry should answer the auditor's questions WITHOUT them having to ask follow-ups. If you're tempted to skip a field "to keep it simple," default to including it with `null` if not applicable. The auditor would rather see explicit nulls than wonder if a field was forgotten.

This is the entire reason for §1's standard. Stick to it.

---

**End of brief.** Replies, contract clarifications, scope changes → back to Patrick. Don't make scope decisions unilaterally.
