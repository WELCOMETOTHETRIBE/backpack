# TrainOS handoff: Google Meet attendance for IR Tabletop bundles

## Context

The Codex side of the Google Meet → assessment attendance pipeline
shipped in commit [4beaea9](https://github.com/WELCOMETOTHETRIBE/CMMC/commit/4beaea9):

- `POST /api/integrations/google-meet-attendance` accepts attendance
  rosters from a Google Apps Script that watches a Drive folder.
- For RA + CA matches: fully self-contained on Codex (those bundles
  are Codex-native, built from controls/cycles).
- For IR matches: Codex records the import as raw provenance, marks
  participants attended on its mirror table, and fires the canonical
  rescore. **It does NOT stamp the bundle's `attendance_corroboration_file_sha256`**
  — that would be a false claim because the IR bundle ZIP lives in
  Azure Gov and is built/owned by TrainOS, not Codex.

To close the IR loop properly, **TrainOS needs to expose an
attendance ingest endpoint** so the CSV bytes physically end up in
the bundle ZIP that goes to Azure Gov. After that, the existing
TrainOS → Codex bundle bridge handles the rest.

This doc is the spec for the TrainOS team to build that endpoint, plus
the Apps Script change that routes IR-tagged meetings to TrainOS
instead of Codex.

## What lives where

| Concern | Owner | Why |
| --- | --- | --- |
| Drive folder watch + CSV parse | Apps Script (Workspace) | Native Drive access |
| Bundle ZIP construction | TrainOS | Already does this for IR exercises |
| Bundle bytes | Azure Gov blob | CUI authorization boundary |
| Manifest + sha256 ledger | Codex (via existing IR bridge) | C3PAO-facing audit trail |
| Raw attendance provenance | Codex (`meeting_attendance_imports`) | Cross-provider record (Google Meet today; Teams/Zoom later) |
| Participant attendance attestation | TrainOS (canonical) → Codex (mirror) | TrainOS already manages run console; Codex holds the IR exercise table for SCTM/scoring |

## TrainOS endpoint to build

```
POST /api/ir-tabletop/exercises/{exerciseId}/attendance/import
```

### Auth

Same Bearer + HMAC pattern Codex uses for the Google Meet bridge,
just with TrainOS-side env vars:

```
Authorization: Bearer ${TRAINOS_GMEET_BRIDGE_TOKEN}
X-GMeet-Bridge-Timestamp: ${unixMillis}
X-GMeet-Bridge-Signature: hex(hmac_sha256(${HMAC_SECRET}, `${ts}.${rawBody}`))
X-GMeet-Bridge-Org: ${orgId or clerkOrgId}
X-GMeet-Bridge-Caller: google-meet-apps-script
X-GMeet-Bridge-User-Email: ${runner_email}
```

5-minute clock-skew window. Constant-time bearer compare. Reject on
mismatch with `HTTP 401 {"error": "..."}`. The reference
implementation is [src/lib/google-meet-bridge.ts](../../src/lib/google-meet-bridge.ts) on Codex
— port the verifier verbatim, just rename the env vars on the TrainOS
side.

### Request body

Same JSON shape the Apps Script sends to Codex today (so the script
emits one schema, just to two destinations):

```json
{
  "meetingTitle": "Q4 2026 IR Tabletop [CDX-IR-a1b2c3d4]",
  "meetingStartedAt": "2026-05-11T19:00:00Z",
  "meetingEndedAt":   "2026-05-11T19:32:00Z",
  "meetingDurationMinutes": 32,

  "driveFileId":   "1AbCdEf...",
  "driveFileUrl":  "https://drive.google.com/file/d/.../view",
  "driveFileName": "Q4 IR Tabletop — Attendance report.csv",
  "driveFileSha256": "9f2a...",

  "csvBytesBase64": "TmFtZSxFbWFpbC4uLg==",

  "attendees": [
    {
      "name": "Alice Doe",
      "email": "alice@mactechsolutionsllc.com",
      "joinTimeIso": "2026-05-11T19:00:12Z",
      "leaveTimeIso": "2026-05-11T19:32:01Z",
      "durationMinutes": 32,
      "role": "HOST"
    }
  ]
}
```

Difference from the Codex payload: `csvBytesBase64` is **required** on
the TrainOS endpoint. TrainOS needs the actual file bytes to put in
the bundle ZIP — sending only the parsed roster wouldn't be
defensible (the C3PAO needs the original CSV as the artifact).

### What TrainOS does on receipt

In order, all in one transaction where possible:

1. **Verify auth** as described above.
2. **Verify the exercise belongs to the org** in the
   `X-GMeet-Bridge-Org` header. 404 if not.
3. **Verify the URL `exerciseId` matches** the tag prefix in
   `meetingTitle` (`[CDX-IR-{first8charsOfExerciseId}]`). 422 if
   they don't agree — protects against the operator pasting the
   wrong tag into the Meet title.
4. **Decode the CSV bytes** and verify `sha256(csvBytes) === driveFileSha256`
   if both are present. Mismatch → 422.
5. **Dedup**: if a previous attendance import for this `(exerciseId,
   driveFileId)` exists, return 200 with `action: "already_imported"`
   and the prior ID. Same idempotency posture Codex uses.
6. **Persist the CSV** to the working bundle staging area for this
   exercise. File name should be deterministic (e.g.
   `attendance/google-meet-{driveFileId}.csv`) so re-runs overwrite
   cleanly.
7. **Upsert participants**: for each attendee with an email, find or
   create a participant row on the exercise. Match by case-insensitive
   email. Set `attendedAt`, `attestationBasis = "present_via_video"`.
8. **Re-build the bundle ZIP** including the new CSV. Recompute
   `manifestSha256` and `bundleSha256`.
9. **Upload the new ZIP** to Azure Gov (overwriting the prior
   provisional version, or as version N+1 — whichever the existing
   bundle versioning supports).
10. **POST the new manifest to Codex** via the existing
    `POST /api/ir-tabletop/exercises/{id}/bundle` endpoint with:
    - `attendanceCorroborationKind: "google_meet_csv"`
    - `attendanceCorroborationFileSha256: <sha256 of the CSV>`
    - The CSV listed in `files[]` with its sha256 + size + mime
11. **Audit log** the entire transaction with the Drive file ID +
    sha256 + the CSV's place in the bundle, so a C3PAO can reconstruct
    the chain of custody from Google → TrainOS → Azure Gov.

### Response

```json
{
  "ok": true,
  "action": "imported",
  "exerciseId": "a1b2c3d4-...",
  "bundleId": "...",
  "bundleVersion": 3,
  "participantsUpdated": 4,
  "participantsCreated": 0,
  "csvSha256": "9f2a...",
  "csvBundlePath": "attendance/google-meet-1AbCdEf.csv",
  "azureGovUri": "https://...usgovcloudapi.net/...",
  "codexManifestPushed": true,
  "contractVersion": "google-meet-trainos.v1"
}
```

On idempotent re-run:

```json
{
  "ok": true,
  "action": "already_imported",
  "exerciseId": "a1b2c3d4-...",
  "bundleId": "...",
  "bundleVersion": 3,
  "contractVersion": "google-meet-trainos.v1"
}
```

### Acceptance criteria

- [ ] Bearer + HMAC + timestamp skew enforced (constant-time compare)
- [ ] Tag-vs-URL mismatch rejected with 422
- [ ] CSV sha256 verification rejects on mismatch
- [ ] Re-POST with same `driveFileId` returns `action: "already_imported"`
- [ ] CSV physically present in the next bundle ZIP uploaded to Azure Gov
- [ ] Codex's existing `/api/ir-tabletop/exercises/{id}/bundle` endpoint receives a manifest with `attendanceCorroborationKind: "google_meet_csv"` + the CSV in `files[]`
- [ ] Codex's bundle row reflects `attendance_corroboration_kind = 'google_meet_csv'` and a sha256 that matches what's actually in the bundle ZIP
- [ ] Audit log row written with Drive file ID, sha256, and bundle version
- [ ] C3PAO can download the bundle ZIP from Azure Gov and verify the CSV's sha256 against the manifest

## Apps Script change

Once the TrainOS endpoint is live, the Apps Script in [Code.gs](Code.gs)
needs to learn to route by tag kind:

```javascript
// Pseudo-diff against the current processOne()
const tag = parseTag(parsed.meetingTitle);  // returns {kind, idPrefix} or null

let url;
let payload;
if (tag && tag.kind === 'IR') {
  url = `${trainosBaseUrl}/api/ir-tabletop/exercises/${tag.idPrefix}/attendance/import`;
  payload = {
    ...parsedPayload,
    csvBytesBase64: Utilities.base64Encode(csvText),  // NEW for TrainOS
  };
} else {
  // RA, CA, or untagged → Codex (current path)
  url = `${codexBaseUrl}/api/integrations/google-meet-attendance`;
  payload = parsedPayload;
}
```

Add a Script Property `TRAINOS_BASE_URL` (e.g.
`https://training.mactechsolutionsllc.com`). The bridge token + HMAC
secret should be **separate from the Codex ones** (different services,
different rotation cycles) — add `TRAINOS_GMEET_BRIDGE_TOKEN` and
`TRAINOS_GMEET_BRIDGE_HMAC` to the Script Properties.

Note: the Apps Script doesn't have the full exercise UUID — only the
8-char prefix from the tag. TrainOS will need to either (a) accept the
prefix in the URL and resolve internally, or (b) the Apps Script first
calls a TrainOS lookup endpoint to expand prefix→full id. Option (a)
is simpler — the URL becomes `/api/ir-tabletop/exercises/by-prefix/{prefix}/attendance/import`
and the route resolves to the full ID server-side (rejecting if more
than one exercise in the org matches the prefix — a 4B namespace makes
collisions vanishingly rare but not impossible).

## Rollout sequence

1. **TrainOS team** builds the endpoint + ships it. Adds
   `TRAINOS_GMEET_BRIDGE_TOKEN` + `TRAINOS_GMEET_BRIDGE_HMAC` to its
   Railway env vars.
2. **Apps Script** gets updated to route IR-tagged meetings to
   TrainOS, with two new Script Properties (`TRAINOS_BASE_URL`,
   `TRAINOS_GMEET_BRIDGE_TOKEN`, `TRAINOS_GMEET_BRIDGE_HMAC`).
3. **Smoke test** with a real Meet tagged `[CDX-IR-{prefix}]`:
   - Drive file lands in folder
   - Apps Script picks it up within 10 min
   - TrainOS receives, attaches CSV to bundle, uploads to Azure Gov,
     pushes manifest to Codex
   - Codex bundle row shows `attendance_corroboration_kind = 'google_meet_csv'`
     with a sha256 the C3PAO can verify by downloading the ZIP
4. **Decommission** the Codex IR side-effect path (the
   `if (matchKind === "ir_tabletop")` block in [route.ts](../../src/app/api/integrations/google-meet-attendance/route.ts)) — leave it as a fallback for one cycle, then delete.

Until step 1 ships, IR attendance imports land on Codex as raw
provenance + a participant `attendedAt` mirror update + a rescore
fire. That's not nothing — the dashboard will reflect attendance — but
the bundle ZIP a C3PAO downloads will lack the CSV. Operator gets a
warning on the IR exercise detail page when this state is detected
(attendance import exists but bundle has `attendance_corroboration_kind = 'facilitator_only'`).
That warning surface is a TODO on the Codex side.

## Open questions for TrainOS

1. Does the existing bundle versioning support "append to current
   provisional version" semantics, or does each attendance import
   roll a new version? The latter is simpler but produces N versions
   per exercise (one per attendance import).
2. Is the "working bundle staging area" already a concept, or does
   TrainOS need to introduce one to hold the CSV between exercise
   archive triggers?
3. Where does TrainOS want to surface "attendance imported from
   Google Meet" in the run console UI? A timeline event? A new tab?
4. What's TrainOS's existing pattern for "the same Drive file was
   imported before" — does the upsert path care, or do we just write
   a new participant row each time?

These need to be answered before TrainOS can spec the implementation
fully. Codex has no opinion on most of them (we just consume the
manifest).
