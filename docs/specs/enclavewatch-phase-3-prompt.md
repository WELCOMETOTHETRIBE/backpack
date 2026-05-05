# EnclaveWatch — Phase 3 brief: ISSO review UI + pull clients + version branch

**Send this verbatim to whoever / whatever is working on EnclaveWatch (the .NET service inside the vault).** It's self-contained — no codex context required to act. Refer to `enclavewatch-sprint-4-prompt.md` and `isso-export-manifest-v1.1.md` if you need to look up the contract surface.

---

## Goal

Phase 1 shipped the break-glass watcher (events emitted as `NormalizedEvent` rows). Phase 2 shipped the v1.1 manifest builder + signer (deterministic `manifest_id`, HMAC, forbidden-key gate). **Phase 3 wires those into the existing weekly-review export trigger and gives the ISSO a UI to populate the new v1.1 sections.**

When Phase 3 lands and you flip `Export.ManifestVersion = "1.1"`, the next ISSO sign + export will:

1. Hit the codex's new endpoint (`POST /api/enclavewatch/isso-export/ingest`) instead of the legacy `/weekly-review/ingest`
2. Carry the full v1.1 body — every section the ISSO populated through the UI
3. Land register entries on the codex side that satisfy ~80% of the 110 NIST 800-171 R2 controls when the ISSO ticks the right checkboxes

---

## What's already built and verified

| Component | Status | Phase |
|---|---|---|
| `BreakGlassWatchCollector` (Azure Graph + Windows Security log) | ✅ d6fcbe5, smoke-tested live on pilot | Phase 1 |
| `BreakGlassWatchSettings` + `ExportSettings` | ✅ d6fcbe5 | Phase 1 |
| `ForbiddenKeyValidator`, `ManifestIdComputer`, `HmacRequestSigner` | ✅ 64e179a, 17/17 v1.1 tests | Phase 2 |
| `CodexWeeklyExportBuilderV11` | ✅ 64e179a | Phase 2 |
| Codex `POST /api/enclavewatch/isso-export/ingest` | ✅ live in prod | codex Sprint 1 |
| Codex `GET /api/enclavewatch/break-glass-acks` | ✅ live in prod | codex Sprint 1 |
| Codex `GET /api/enclavewatch/isso-review-checklist` | ✅ live in prod | codex Sprint 1 |
| Codex handlers for all 11 v1.1 sections | ✅ live in prod | codex Sprints 1–5 |

**The codex side is feature-complete for v1.1.** Any section your manifest carries lands a register entry. Sections you don't carry yet are silent no-ops. You can ship Phase 3 incrementally — start with break-glass + freshness, add other sections in follow-ups, the codex doesn't care which sections are present.

---

## What Phase 3 builds (three pieces)

### 1. Pull clients for the two codex GET endpoints

Two HTTP clients in EnclaveWatch.Infrastructure that call the codex's GET endpoints during ISSO review. Reuse the existing bearer-token auth pattern (`Codex:ApiToken` from appsettings).

#### `BreakGlassAcksClient.GetAcksAsync(vaultId, since, until)`

```
GET https://codex.mactechsolutionsllc.com/api/enclavewatch/break-glass-acks?vault_id={vaultId}&since={iso}&until={iso}
Authorization: Bearer {Codex:ApiToken}
```

Response:
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
  ],
  "since": "RFC3339",
  "until": "RFC3339"
}
```

Map to a `BreakGlassAckItem` record. Cache for the duration of the review session (don't re-fetch on every UI refresh).

#### `IssoReviewChecklistClient.GetChecklistAsync(vaultId, periodEnd)`

```
GET https://codex.mactechsolutionsllc.com/api/enclavewatch/isso-review-checklist?vault_id={vaultId}&period_end={iso}
Authorization: Bearer {Codex:ApiToken}
```

Response:
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

Map to `IssoChecklistItem` record. Same caching note.

**Both endpoints support `replayed: true` semantics on the POST side** — implement HTTP retry (exponential backoff) for transient failures, and treat 200 + `replayed: true` as success.

### 2. ISSO review UI extensions

The existing weekly-review Razor page (`Exports.cshtml`) gains nine new sections — one per v1.1 register key plus the two cross-cutting blocks. Each section is a `<details>` block (collapsed by default, expand to populate). Section list:

| UI Section Title | Manifest Path | Input Type |
|---|---|---|
| Audit log review (existing) | `registers.audit_log_review.weekly_review` | already there — keep |
| Maintenance — break-glass observations | (auto-populated from `NormalizedEvent` rows) | read-only summary |
| Maintenance — scheduled & remote | `registers.maintenance_log.scheduled_maintenance[]` + `.remote_maintenance[]` | repeatable rows |
| Incidents this period | `registers.incident_log.incidents_during_period[]` | repeatable rows |
| Access-authorization findings | `registers.access_authorizations.weekly_review_findings[]` | repeatable rows |
| Vulnerability verifications | `registers.vuln_remediation.verifications[]` | repeatable rows |
| Training completions | `registers.training_completion.completions_during_period[]` + `.expiring_attestations[]` | repeatable rows + LMS pull |
| Stale policy documents | `registers.policy_review.stale_documents[]` | repeatable rows |
| Review observations | `registers.assessment_findings.review_observations[]` | repeatable rows |
| Media handling | `registers.media_handling_log.{media_destroyed,removable_media_authorized,bitlocker_attestations}[]` | repeatable rows |
| Personnel events | `registers.personnel_screening.events_during_period[]` | repeatable rows |
| **Control freshness checklist** | `control_freshness.freshly_observed_implemented[]` (and `.needing_attention[]`) | checkbox list, sourced from `/isso-review-checklist` |
| **Prior-period ack outcomes** | `previous_period_acknowledgments_review.items[]` | one outcome dropdown per item, sourced from `/break-glass-acks` |

**Layout pattern per section:**

```
<details>
  <summary>{Section title}</summary>
  <p>{Hint about what to populate during review}</p>
  <table>
    [repeatable rows or fixed inputs per the manifest section schema]
  </table>
  [Add row button if repeatable]
</details>
```

**Critical UX requirements:**
- **Don't pre-check anything**. Stale controls in the checklist should be highlighted (red text or amber dot) but NOT pre-checked. The ISSO must affirmatively click each box.
- **Free-text fields are optional** (notes, isso_note) — required fields per the v1.1 spec are enforced server-side, but make required-marker stars visible.
- **Validation on submit**: if any required field is missing, show a per-section error banner with the field path. Don't try to round-trip through the codex; validate locally first.
- **Don't auto-save drafts** to the codex. Save to local state in EnclaveWatch only until ISSO clicks "Sign + Export."

### 3. Version branch in `Exports.cshtml.cs`

The existing weekly-review export handler reads the ISSO's filled form, builds a v1.0 ack package, and POSTs to `/api/enclavewatch/weekly-review/ingest`. Phase 3 adds a branch:

```csharp
if (settings.Export.ManifestVersion == "1.1")
{
    var manifest = _v11Builder.Build(reviewState, breakGlassEvents, ackItems, controlChecklist);
    var manifestJson = JsonSerializer.Serialize(manifest, ManifestJsonOptions);
    var signature = _hmacSigner.Sign("POST", "/api/enclavewatch/isso-export/ingest", manifestJson);

    var response = await _httpClient.PostAsync(
        $"{settings.Codex.BaseUrl}/api/enclavewatch/isso-export/ingest",
        new StringContent(manifestJson, Encoding.UTF8, "application/json")
        {
            Headers = { { "Authorization", $"Bearer {settings.Codex.ApiToken}" }, { "X-Signature", signature } }
        });

    response.EnsureSuccessStatusCode();
    var result = await response.Content.ReadFromJsonAsync<IngestResult>();
    _logger.LogInformation(
        "[exports.v1_1] manifest_id={ManifestId} replayed={Replayed} sections={Sections} controls_touched={Controls}",
        result.ManifestId, result.Replayed, result.SectionsProcessed.Length, result.ControlsTouched.Length);
}
else
{
    // existing v1.0 path — unchanged
}
```

`reviewState` carries every field the ISSO filled. `breakGlassEvents` is the result of querying `NormalizedEvent` for `EventFamily = "break_glass_signin"` in the review window. `ackItems` is the response from `BreakGlassAcksClient`. `controlChecklist` is the response from `IssoReviewChecklistClient`.

**Roll-back behavior:** flipping `ManifestVersion` back to `"1.0"` in appsettings reverts to the legacy export path. No database migrations to roll back; the codex's `isso_export_manifests` table just stops growing.

---

## Test plan (must pass before merging)

1. **Pull-client tests**:
   - Stub the codex GET endpoints; verify request shape (vault_id + since/until / period_end).
   - Verify response deserialization for all `ack_status` and `is_stale` cases.
   - Verify retry behavior on 503; verify graceful failure on 401 (don't render UI section, log error).

2. **UI integration test** (Selenium / Playwright):
   - Open weekly-review screen → all 9 new sections collapsed by default.
   - Expand the control-freshness checklist → it populates from `/isso-review-checklist`.
   - Expand the ack-outcomes block → it populates from `/break-glass-acks` with one outcome dropdown per item.
   - Fill at least one required field on each section, leave one required field empty → submit fails with section error banner pointing at the field.

3. **End-to-end smoke against the pilot codex**:
   - Set `Export.ManifestVersion="1.1"`.
   - Trigger weekly export with the ISSO populating only `audit_log_review` + `control_freshness.freshly_observed_implemented[]`.
   - Codex should respond with `{ ok: true, replayed: false, manifest_id: "...", sections_processed: ["audit_log_review", "control_freshness"], controls_touched: [...] }`.
   - Replay the exact same manifest → `{ ok: true, replayed: true }`.
   - Inject a forbidden key (`raw_event_xml: "..."`) into any section → codex returns 400 with `code: FORBIDDEN_KEY_REJECTED`.

4. **Break-glass closed-loop test**:
   - Enable `BreakGlassWatch` with `MonitoredUpns=[emergency-bg-cui@...]`.
   - Use the break-glass account once via Azure portal.
   - Wait one collector tick (~6 min).
   - Trigger weekly export. Codex creates a draft `break_glass_acknowledgment` entry.
   - Patrick (admin) opens https://codex.mactechsolutionsllc.com/dashboard/evidence-engine/entries/{entryId} and signs the acknowledgment form.
   - Next week's review: vault calls `/break-glass-acks` → outcome dropdown shows `acknowledged` for that alert.
   - ISSO picks `verified_timely` → manifest's `previous_period_acknowledgments_review.items[]` carries it → codex finalizes the entry with ISSO verification.

5. **Roll-back smoke**:
   - With `ManifestVersion="1.1"` working, flip back to `"1.0"`.
   - Trigger weekly export → legacy v1.0 endpoint receives the request as before.
   - No regressions to v1.0 ingest path.

---

## Configuration additions

```json
// appsettings.Production.json
{
  "Export": {
    "ManifestVersion": "1.1",
    "Endpoint": "https://codex.mactechsolutionsllc.com/api/enclavewatch/isso-export/ingest",
    "SigningSecretFile": "/etc/enclavewatch/manifest-signing.key"
  },
  "Codex": {
    "BaseUrl": "https://codex.mactechsolutionsllc.com",
    "ApiToken": "<bearer token from codex>",
    "PullClient": {
      "TimeoutSeconds": 15,
      "RetryAttempts": 3,
      "RetryBackoffMs": 500
    }
  }
}
```

The HMAC signing secret is the same value the codex side stores. Patrick can rotate this on a schedule once Phase 3 is live.

---

## Definition of done (Phase 3)

- [ ] Two pull clients implemented + tested per Test Plan §1
- [ ] Nine UI sections rendered, each populating the correct manifest path
- [ ] Control-freshness checklist sourced from `/isso-review-checklist`
- [ ] Prior-period ack outcomes sourced from `/break-glass-acks`
- [ ] `Exports.cshtml.cs` version branch routes to v1.1 builder when `ManifestVersion="1.1"`
- [ ] Roll-back to `"1.0"` proven (Test Plan §5)
- [ ] End-to-end smoke against pilot codex successful (Test Plan §3)
- [ ] Break-glass closed-loop test successful (Test Plan §4)
- [ ] Cross-platform build clean, Windows publish clean, full test suite green

Don't ship if any of these aren't true. The codex side has been waiting for this, but rushing Phase 3 ahead of the integration smoke breaks the value of having shipped Phases 1+2 cleanly.

---

## What's NOT in Phase 3 (descope notes)

- **Dispute UI** for the `dispute_pending` ack status. Reserved for v1.2; Phase 3 treats `disputed` items the same as `overdue_no_ack` for outcome purposes (per spec §13).
- **Per-section signature**. Whole-manifest signature is sufficient (per spec §13.4).
- **Streaming export of large manifests**. Worry about that when a single weekly review starts producing > 5 MB of payload, which it won't on a pilot of MacTech's size.
- **ISSO override of admin acknowledgment**. ISSO already has implicit override via the `verified_timely` outcome (which finalizes the entry even without admin fields). A more granular override is a follow-up.

---

**End of brief.** Replies, questions, scope changes → back to the codex side via Patrick. Don't make scope decisions unilaterally — the contract is the contract, and the codex is already building to it.
