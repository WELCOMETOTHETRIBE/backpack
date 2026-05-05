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
- **Output:** for each detected event, emit a `BreakGlassSignInDetected` event into the existing EnclaveWatch event bus with the shape below. The existing weekly-review exporter picks these up automatically (see Section 2).
- **Dedupe:** Azure signIn `id` and vault Security log `RecordID` are the natural keys. Re-emitting the same event is forbidden.
- **Safety:** if the watcher crashes or can't reach Graph, log loudly (`error` severity into local audit log) but DO NOT block the rest of EnclaveWatch. The watcher is best-effort but its failures must be observable.

### Event shape

```json
{
  "alert_id": "bg-{utc_iso8601_compact}-{short_correlation}",
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

`alert_id` MUST be deterministic per detected event. Recommend: `bg-{Azure signIn id OR vault EventRecordID}` so re-emission produces the same alert_id and codex de-duplicates correctly.

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
| `control_freshness.freshly_observed_implemented[]` | ISSO checks a list of controls during review; populated based on what was observed operating |
| `control_freshness.needing_attention[]` | Detected gaps (e.g. "no maintenance activity in 90d for control 3.7.5") |
| `previous_period_acknowledgments_review.items[]` | Pulled from prior week's break-glass alerts that have responses logged |

### ISSO review UI (in the vault dashboard)

Extend the existing weekly review screen so the ISSO sees, for each section, a checklist:
- Items detected during the period (auto-populated from collectors)
- Free-text fields for ISSO commentary
- "Mark as observed implemented" checkboxes against a pre-configured control list (drives `freshly_observed_implemented[]`)
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
