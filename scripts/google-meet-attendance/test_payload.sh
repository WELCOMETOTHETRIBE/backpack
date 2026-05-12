#!/usr/bin/env bash
#
# Manual test harness for /api/integrations/google-meet-attendance.
# Useful for: smoke-testing the endpoint without going through Apps
# Script, backfilling attendance from a CSV the script missed, or
# debugging HMAC mismatches.
#
# Requires: bash, curl, openssl, jq, python3 (for canonical JSON
# serialization — order-stable so the HMAC matches what the route
# computes server-side).
#
# Usage:
#   GOOGLE_MEET_BRIDGE_TOKEN=… \
#   GOOGLE_MEET_BRIDGE_HMAC=… \
#   CODEX_BASE_URL=https://codex.mactechsolutionsllc.com \
#   CODEX_ORG_ID=901cc0c7-79b1-466b-a402-14c3ec7771ff \
#   ./test_payload.sh

set -euo pipefail

: "${GOOGLE_MEET_BRIDGE_TOKEN:?required}"
: "${GOOGLE_MEET_BRIDGE_HMAC:?required}"
: "${CODEX_BASE_URL:?required}"
: "${CODEX_ORG_ID:?required}"

BODY=$(python3 -c '
import json, sys
print(json.dumps({
    "meetingTitle": "Smoke test [CDX-IR-deadbeef]",
    "meetingStartedAt": "2026-05-11T19:00:00Z",
    "meetingEndedAt":   "2026-05-11T19:32:00Z",
    "meetingDurationMinutes": 32,
    "driveFileId": "smoke-test-" + __import__("os").urandom(6).hex(),
    "driveFileUrl": "https://drive.google.com/file/d/smoke-test/view",
    "driveFileName": "Smoke test — Attendance report.csv",
    "attendees": [
        {"name": "Patrick Test", "email": "patrick@welcometothetribe.com",
         "joinTimeIso": "2026-05-11T19:00:12Z",
         "leaveTimeIso": "2026-05-11T19:32:01Z",
         "durationMinutes": 32, "role": "HOST"},
        {"name": "James Test", "email": "james@mactechsolutionsllc.com",
         "joinTimeIso": "2026-05-11T19:01:00Z",
         "leaveTimeIso": "2026-05-11T19:32:00Z",
         "durationMinutes": 31, "role": "PARTICIPANT"},
    ],
}, separators=(",", ":")))')

TS=$(($(date +%s) * 1000))
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$GOOGLE_MEET_BRIDGE_HMAC" -hex | awk '{print $2}')

echo "POST ${CODEX_BASE_URL}/api/integrations/google-meet-attendance"
echo "  ts=${TS}"
echo "  sig=${SIG:0:16}..."
echo

curl -fsS -w "\nHTTP %{http_code}\n" \
  -X POST \
  -H "Authorization: Bearer ${GOOGLE_MEET_BRIDGE_TOKEN}" \
  -H "X-GMeet-Bridge-Timestamp: ${TS}" \
  -H "X-GMeet-Bridge-Signature: ${SIG}" \
  -H "X-GMeet-Bridge-Org: ${CODEX_ORG_ID}" \
  -H "X-GMeet-Bridge-Caller: bash-test-payload" \
  -H "X-GMeet-Bridge-User-Email: patrick@welcometothetribe.com" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "${CODEX_BASE_URL}/api/integrations/google-meet-attendance"
