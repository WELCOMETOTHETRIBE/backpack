# EnclaveWatch — Sprint 4 brief: break-glass watcher + ISSO Export Manifest v1.1

**Send this verbatim to whoever / whatever is working on EnclaveWatch (the .NET service inside the vault).** It's self-contained — no codex context required to act.

---

## Context

The codex (Trust Codex / control-plane) is shipping a new ingest endpoint that accepts a richer ISSO export manifest, version **v1.1**. The manifest evolves the existing weekly-review ack package into a structured multi-register payload that drives evidence freshness across ~25 controls per export. **Read the full spec at the link the codex team will provide alongside this brief** (`docs/specs/isso-export-manifest-v1.1.md` in the codex repo).

This brief covers two distinct pieces of EnclaveWatch work:

1. **A new collector**: detect break-glass account sign-ins (Azure side + vault side) and feed them into the local event store
2. **A new exporter**: emit the v1.1 manifest format on the existing weekly-review cadence

Both must be built so they can be verified against the codex contract. Do not ship without test coverage.

---

## 1. Break-glass detection collector

**Goal:** detect every authentication event by the break-glass account, from any source, with no missed events.

### What to monitor

| Source | Signal | API / Log channel |
|---|---|---|
| Azure / Entra | Interactive sign-ins by the break-glass UPN | Microsoft Graph `auditLogs/signIns` filtered by `userPrincipalName eq '<break-glass UPN>'` |
| Azure / Entra | Service-principal-style auth (rare but possible) | Same endpoint — record `appDisplayName`, `clientAppUsed` |
| Vault | Local Windows logon by the break-glass account | Windows Security log Event ID 4624 (logon success) + 4625 (failure), filtered by username |
| Vault | SSH session by the break-glass account | OpenSSH for Windows event log + Security log 4624 (logon type 10 = remote interactive) |

The break-glass UPN comes from configuration: `appsettings.json` → `BreakGlassWatch.MonitoredUpns` (array, supports multiple — e.g. an org might have a primary BG and a backup).

### Behavior

- **Polling cadence:** every 5 minutes (configurable). Microsoft Graph signIn logs lag by ~5 min anyway, so finer cadence buys nothing.
- **State:** persist last-seen `signIn.id` (Azure) and last-seen Security log RecordID (vault) in `~/.EnclaveWatch/break-glass-watcher.state.db` (SQLite). Survive process restart without losing events.
- **Output:** for each detected event, write a `NormalizedEvent` row (same pattern as every other collector — e.g. `WindowsEventLogCollector.Windows.cs:350` does `db.Events.Add(evt)`). Set:
  - `EventFamily = "break_glass_signin"` (singular, lowercase, underscore)
  - `Source = "azure"` or `"vault"` per detection origin
  - `Severity = "warning"` (expected but high audit interest)
  - `Timestamp = <actual sign-in time>` (NOT poll time)
  - `Subject = <break-glass UPN exactly as it appears in source>` (don't normalize case)
  - `Summary = "Break-glass sign-in observed: <upn> from <ip> via <app>"` (short, one-liner)
  - `Json = <full payload, see "Event shape" below>` — the JSON IS what the exporter ships into `break_glass_signins[]` 1:1, no transformation
  
  The existing weekly-review exporter picks these rows up by querying `WHERE EventFamily = 'break_glass_signin' AND Timestamp BETWEEN @reviewPeriodStart AND @reviewPeriodEnd`.
- **Dedupe:** check existing NormalizedEvent rows by `Json->>'alert_id'` before inserting. Azure signIn `id` and vault Security log `RecordID` produce a stable `alert_id` so re-poll across restarts can't double-emit. Re-emitting the same event is forbidden.
- **Safety:** if the watcher crashes or can't reach Graph, log loudly (`error` severity into local audit log) but DO NOT block the rest of EnclaveWatch. The watcher is best-effort but its failures must be observable.

### Event shape (the value you put in `NormalizedEvent.Json`)

This is the canonical break-glass per-entry shape. The codex manifest spec §4.2 has the same form. Vault writes this verbatim into `NormalizedEvent.Json`; the exporter reads it back at export time and includes it in `registers.maintenance_log.break_glass_signins[]`.

```json
{
  "alert_id": "bg-azure-{signIn.id}" | "bg-vault-{EventRecordID}",
  "detected_at": "RFC3339",
  "source": "azure" | "vault",
  "upn": "emergency-bg-cui@MacTechSolutions256.onmicrosoft.com",
  "client_ip": "string",
  "app_or_resource": "string",
  "duration_seconds": 0,
  "session_correlation_id": "string (Azure correlationId or vault session GUID)",
  "actions_observed": ["string"],
  "ip_classification": "private | corp | unknown_or_shared"
}
```

`alert_id` MUST be deterministic from the source event ID:
- Azure: `bg-azure-{signIn.id}` where `signIn.id` is the Microsoft Graph signIn record GUID
- Vault: `bg-vault-{EventRecordID}` where EventRecordID is the Windows Security log record ID

Re-emission MUST produce the same alert_id so codex idempotency works.

`actions_observed[]` — populate from Activity Log if available (e.g. "Modified CA policy <id>"), otherwise empty. Don't fabricate.

`ip_classification` — best effort. If client IP is a private RFC1918 range → `private`. If matches any IP in `appsettings.json:KnownCorpIpRanges` → `corp`. Else → `unknown_or_shared`.

### Test plan (must pass before merging)

1. Use the break-glass account to sign in once via Azure portal → watcher emits exactly one `BreakGlassSignInDetected` within 6 min, alert_id matches the Azure signIn id format.
2. Restart the EnclaveWatch service mid-poll → no duplicate events emitted; state.db rehydrates correctly.
3. Sign in twice in rapid succession (different correlation IDs) → two distinct events emitted.
4. Sign in once via Azure AND once via vault SSH within the same window → two distinct events, one per source.
5. Disconnect the vault from the internet for 30 min, then reconnect → watcher catches up on missed Azure events without gaps.
6. Configure `MonitoredUpns: []` (empty) → watcher idles, emits nothing, no errors.

---

## 2. ISSO Export Manifest v1.1 emitter

**Goal:** evolve the existing weekly-review export (v1.0) to emit the v1.1 manifest format. v1.0 emission stays available behind a config flag for rollback safety.

### What changes

- Add config flag: `Export.ManifestVersion = "1.1"` (default `"1.0"` until ready). When set to `"1.1"`, the exporter emits the new shape and POSTs to `/api/enclavewatch/isso-export/ingest`. When `"1.0"`, behavior is unchanged.
- The full v1.1 shape is documented in the codex spec — see top-level keys: `manifest_version`, `manifest_id`, `acknowledgement`, `review_summary`, `registers`, `control_freshness`, `previous_period_acknowledgments_review`.
- `manifest_id` MUST be `sha256(canonical_body_minus_manifest_id)` — i.e. computed AFTER serializing every other field. This makes manifest_id a content-hash, which lets the codex safely dedupe replays.
- `manifest_id` must also incorporate `vault_id` and `review_period_end` to avoid cross-vault collisions.

### Section data sources (v1.1)

| Section | Data source on vault |
|---|---|
| `acknowledgement` | Existing logic (unchanged from v1.0) |
| `review_summary` | New — ISSO populates during review (free-text + counts) |
| `registers.audit_log_review.weekly_review` | Existing logic (unchanged from v1.0) |
| `registers.maintenance_log.break_glass_signins[]` | Pulled from break-glass watcher state.db, filtered to events in the review window |
| `registers.maintenance_log.scheduled_maintenance[]` | New — admin-entered or pulled from a "maintenance log" the ISSO maintains (initially can be empty array) |
| `registers.maintenance_log.remote_maintenance[]` | Pulled from existing remote-session collector (RDP/SSH events) |
| `registers.incident_log.incidents_during_period[]` | New — pulled from incident tracker if integrated, else empty array |
| `registers.access_authorizations.weekly_review_findings[]` | New — populated by ISSO during review |
| `registers.vuln_remediation.verifications[]` | Pulled from existing MDVM scan reconciliation |
| `registers.training_completion.expiring_attestations[]` | Pulled from training tracker if integrated, else empty array |
| `registers.policy_review.stale_documents[]` | Pulled from policy tracker if integrated, else empty array |
| `registers.assessment_findings.review_observations[]` | Free-form ISSO observations |
| `control_freshness.freshly_observed_implemented[]` | **Vault GETs** the candidate control list from codex (§2a below); ISSO checks boxes; checked control_ids go in this array |
| `control_freshness.needing_attention[]` | Detected gaps (e.g. "no maintenance activity in 90d for control 3.7.5"). Codex's checklist response includes stale flags the vault can use to pre-populate this list, but ISSO has final say |
| `previous_period_acknowledgments_review.items[]` | **Vault GETs** ack status from codex (§2b below); ISSO chooses outcome per item; outcomes go in this array |

### 2a. Codex GET — review checklist (called by vault during ISSO review)

```
GET /api/enclavewatch/isso-review-checklist?vault_id={uuid}&period_end={RFC3339}
Authorization: Bearer {EnclaveWatch token}
```

Response shape (codex side spec §12):
```json
{
  "controls": [
    {
      "control_id": "3.1.7",
      "title": "Audit Privileged Functions",
      "family": "AC",
      "last_evaluated_at": "RFC3339|null",
      "days_since_last_evaluation": 0,
      "is_stale": false,
      "review_hint": "ISSO should confirm logs were reviewed and no anomalies outstanding"
    }
  ],
  "period_end": "RFC3339"
}
```

The codex applies its own filter logic to decide which controls appear (operational lanes only — excludes inherited/N/A). Vault renders the response as the ISSO checklist; checked control_ids go into `control_freshness.freshly_observed_implemented[]`.

**Vault does NOT maintain a local control catalog.** Always trust the codex response — it's the source of truth.

### 2b. Codex GET — break-glass ack status (called by vault during ISSO review)

```
GET /api/enclavewatch/break-glass-acks?vault_id={uuid}&since={RFC3339}&until={RFC3339}
Authorization: Bearer {EnclaveWatch token}
```

Response shape (codex side spec §11):
```json
{
  "items": [
    {
      "alert_id": "bg-azure-...",
      "ack_status": "acknowledged" | "draft_pending" | "disputed" | "overdue_no_ack",
      "acknowledged_by": "string|null",
      "signed_at": "RFC3339|null",
      "purpose_of_session": "string|null",
      "actions_taken": "string|null",
      "before_state": "string|null",
      "after_state": "string|null",
      "draft_age_hours": 0
    }
  ]
}
```

Use `since = previous_review_period_start` and `until = current_review_period_end` so the ISSO sees both fully-acked AND still-pending alerts from the prior cycle. ISSO picks an outcome per item:
- `acknowledged` items → typically `verified_timely`
- `draft_pending` items → typically `verified_timely` (if ISSO can review the draft) or carries to next cycle
- `overdue_no_ack` items → `overdue_escalated`
- `disputed` items → reserved for v1.2 (Sprint 6+); for now treat as `overdue_escalated`

ISSO selections become `previous_period_acknowledgments_review.items[]` in the manifest.

### ISSO review UI (in the vault dashboard)

Extend the existing weekly review screen so the ISSO sees, for each section, a checklist:
- Items detected during the period (auto-populated from collectors)
- Free-text fields for ISSO commentary
- **Control review checkboxes** sourced from the codex GET in §2a — pre-checks for stale ones
- **Break-glass ack outcomes** sourced from the codex GET in §2b — one outcome dropdown per item
- "Add finding" buttons that create `needing_attention[]` items

The export only fires when ISSO clicks **"Sign + Export"**.

### Test plan (must pass before merging)

1. Generate a v1.1 manifest with all sections populated; POST to a stub codex endpoint; verify the codex spec validates the shape.
2. Same input → same `manifest_id`. Different input → different `manifest_id`.
3. Replay protection: POST the same manifest twice, second response must indicate `replayed: true`.
4. Roll back to `ManifestVersion=1.0` → legacy v1.0 export works exactly as before.
5. Empty all sections except `acknowledgement` → ingest succeeds (empty section is valid).
6. Inject a forbidden key (`raw_event_xml: "..."`) into any section → codex rejects with 400, exporter logs error and does not retry.

---

## 3. Configuration additions

```json
// appsettings.json additions
{
  "BreakGlassWatch": {
    "Enabled": true,
    "MonitoredUpns": [
      "emergency-bg-cui@MacTechSolutions256.onmicrosoft.com"
    ],
    "PollIntervalSeconds": 300,
    "KnownCorpIpRanges": ["203.0.113.0/24"],
    "StateDbPath": "~/.EnclaveWatch/break-glass-watcher.state.db"
  },
  "Export": {
    "ManifestVersion": "1.1",
    "Endpoint": "https://codex.mactechsolutionsllc.com/api/enclavewatch/isso-export/ingest"
  }
}
```

---

## 4. What the codex team is doing in parallel

So you have visibility into the other side of the contract:

- Sprint 1 (now): codex ingest endpoint scaffolded, dispatcher pattern, manifest_id dedupe
- Sprint 2: codex `break_glass_acknowledgment` schema + ingest handler (writes draft entries) + admin acknowledgment form + Monitoring tab card
- Sprint 3: codex `control_freshness` handler that bumps `last_evaluated_at`
- Sprint 4: **YOUR SPRINT** — break-glass watcher + v1.1 exporter
- Sprint 5: codex per-register handlers (incident_log, access_auth review, vuln verifications, etc.)
- Sprint 6: codex ISSO follow-up UI (alerts panel, escalation timer, ack verification)

EnclaveWatch and codex sprints can run in parallel after Sprint 1. The earliest moment EnclaveWatch can integration-test against the codex is end of Sprint 2.

---

## 5. Definition of done (Sprint 4)

- [ ] Break-glass watcher implemented + tested per Test Plan §1
- [ ] v1.1 exporter implemented + tested per Test Plan §2
- [ ] Config wired through `appsettings.json`
- [ ] State persistence in SQLite proven across restarts
- [ ] No new forbidden keys leak into the manifest
- [ ] Codex integration test: end-to-end manifest emission → codex ingest → verify register entries land
- [ ] Roll-back path verified: setting `ManifestVersion=1.0` reverts to legacy export

Don't ship if any of these aren't true. The whole point of Sprint 0 (the spec) was to eliminate rework — let's not introduce it now by skipping verification.

---

**End of brief.** Replies, questions, scope changes → back to the codex side via Patrick. Don't make scope decisions unilaterally — the contract is the contract.
