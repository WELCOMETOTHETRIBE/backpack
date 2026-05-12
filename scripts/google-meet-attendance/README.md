# Google Meet → Codex attendance bridge

Captures Google Meet attendance reports and ties them to the matching
IR Tabletop / RA / CA assessment in Codex.

## How it works

```
Google Meet ends
  → Google emails attendance + drops CSV in Drive folder
    → Apps Script picks it up (every 10 min)
      → POSTs parsed roster to /api/integrations/google-meet-attendance
        → Codex matches by [CDX-{kind}-{prefix}] tag in meeting title
          → Updates ir_exercise_participants + stamps bundle corroboration
            → Fires canonical rescore for IR.L2-3.6.1/2/3
```

## One-time setup

### 1. Create the Drive folder Google delivers attendance reports into

In Google Workspace admin → **Apps → Google Workspace → Google Meet → Meet
video settings → Attendance reports**, set the destination folder. Note the
folder's Drive ID (the part after `/folders/` in its URL).

### 2. Create the Apps Script project

- Go to <https://script.google.com> and click **New project**.
- Replace the default `Code.gs` with the contents of [`Code.gs`](Code.gs).
- Rename the project something useful (e.g. `Codex Meet Attendance Bridge`).

### 3. Set Script Properties

In the Apps Script editor: **Project Settings (gear icon) → Script properties → Add**:

| Key                          | Value                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `DRIVE_FOLDER_ID`            | The folder ID from step 1                                              |
| `CODEX_BASE_URL`             | `https://codex.mactechsolutionsllc.com`                                |
| `CODEX_ORG_ID`               | Your `organizations.id` UUID, OR your Clerk `org_*` id                 |
| `GOOGLE_MEET_BRIDGE_TOKEN`   | Shared bearer token (matches `GOOGLE_MEET_BRIDGE_TOKEN` on Railway)    |
| `GOOGLE_MEET_BRIDGE_HMAC`    | Shared HMAC secret (matches `GOOGLE_MEET_BRIDGE_HMAC` on Railway)      |

### 4. Install the trigger

- Top toolbar: pick `installTrigger` from the function dropdown.
- Click **Run**.
- Authorize Drive + UrlFetch when prompted.
- You should see "Trigger installed" in the Executions log.

After that the script runs every 10 min, processing any new attendance
files in the folder. Files it has already imported get a Drive
description tag (`Codex import: …`) and are skipped on subsequent runs.

## Tagging your meetings

For Codex to attach the attendance to an assessment, **the Meet title
must include a tag** of the form:

```
[CDX-{kind}-{first8charsOfId}]
```

Where `kind` is one of `IR`, `RA`, `CA`. Examples:

- `Q4 2026 IR Tabletop [CDX-IR-a1b2c3d4]`
- `Risk Assessment Review — [CDX-RA-deadbeef]`
- `CA Bundle Walkthrough [CDX-CA-12345678]`

The 8-char prefix is the first 8 hex chars of the entity's UUID. You'll
find this on the entity detail page in the Codex dashboard
(displayed as a copy-to-clipboard chip next to the title).

**Untagged meetings** still import — they land in the
`meeting_attendance_imports` table as unmatched, visible in the
dashboard for manual reconciliation.

## Auth

Two secrets shared between Codex (Railway env vars) and the Apps
Script (Script Properties):

- `GOOGLE_MEET_BRIDGE_TOKEN` — bearer token
- `GOOGLE_MEET_BRIDGE_HMAC`  — HMAC secret

Each request signs `${unixMillis}.${rawBody}` with the HMAC and sends:

```
Authorization: Bearer ${TOKEN}
X-GMeet-Bridge-Timestamp: ${unixMillis}
X-GMeet-Bridge-Signature: ${hex_hmac_sha256}
X-GMeet-Bridge-Org: ${ORG_ID}
X-GMeet-Bridge-Caller: google-meet-apps-script
X-GMeet-Bridge-User-Email: ${runner_email}
```

5-minute clock-skew window for replay resistance.

### Rotating secrets

```bash
# Generate
TOKEN=$(openssl rand -hex 32)
HMAC=$(openssl rand -hex 32)

# Set on Railway (CMMC service)
railway variables --set "GOOGLE_MEET_BRIDGE_TOKEN=$TOKEN"
railway variables --set "GOOGLE_MEET_BRIDGE_HMAC=$HMAC"

# Update Apps Script: Project Settings → Script properties → edit both
```

## Manually testing

Drop a real Google Meet attendance CSV into the folder, then in the
Apps Script editor pick `processNewAttendanceFiles` from the function
dropdown and click **Run**. Check Executions for the result.

Or hit the endpoint directly with `curl` from a script that signs the
payload — useful for backfilling historical attendance not yet in
Drive. See [`test_payload.sh`](test_payload.sh) for a worked example.

## Troubleshooting

**Script says `Missing Script Property: X`**
You skipped step 3 or mistyped a key. Re-check the table above —
keys are case-sensitive.

**HTTP 401 `HMAC signature mismatch`**
Either the HMAC secret in the Script doesn't match Railway, or the
Apps Script's clock is more than 5 min off (Google's clock skew is
usually fine; check that you set `GOOGLE_MEET_BRIDGE_HMAC`, not the
TOKEN).

**HTTP 404 from Codex**
Middleware whitelist isn't deployed yet. Check that Railway has
deployed the commit that added `/api/integrations/google-meet-attendance(.*)`
to [`src/middleware.ts`](../../src/middleware.ts).

**Files keep getting skipped**
The script skips files whose name doesn't include "attendance" (case-
insensitive) or whose MIME type isn't `text/csv`. If Google's format
changes, edit the conditional in `processNewAttendanceFiles`.

**Attendees show up but participants aren't marked attended in Codex**
The IR participant match is by **case-insensitive email**. If a
participant's email in Codex differs from what they used to join the
Meet (e.g. personal vs corporate), they won't auto-match. You can
manually mark them attended in the IR Run Console.
