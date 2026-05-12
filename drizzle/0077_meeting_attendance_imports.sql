-- Migration 0077: meeting_attendance_imports
--
-- New table that captures Google Meet attendance CSVs (and, in the
-- future, Teams / Zoom rosters) and ties them to a Codex assessment
-- entity (IR tabletop exercise, RA assessment, CA bundle). Driven by
-- the Apps Script in scripts/google-meet-attendance/Code.gs which
-- watches the Drive folder Google drops attendance reports into and
-- POSTs them to /api/integrations/google-meet-attendance.
--
-- Why a generic table instead of attaching directly to ir_exercise_*:
--   - RA/CA don't have a participant table, but still benefit from
--     "attendance was captured" as evidence
--   - Same shape works for any future video conferencing provider
--   - Provenance from the Drive file ID + sha256 is preserved
--     regardless of where the attendance ends up linked
--
-- The route handler does the matching:
--   - Parses [CDX-{kind}-{8charPrefix}] from the meeting title
--   - kind ∈ {IR, RA, CA} → looks up the entity by id-prefix
--   - On match for IR: updates ir_exercise_participants.attended_at
--     by email AND stamps the latest provisional bundle with
--     attendance_corroboration_kind='google_meet_csv'
--   - On no match: row stays unmatched; visible in the dashboard
--     for manual reconciliation

CREATE TABLE IF NOT EXISTS "meeting_attendance_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,

  -- Source provider — ready for Teams / Zoom additions later.
  "source" text NOT NULL DEFAULT 'google_meet',

  -- Meeting metadata extracted from the attendance file + email.
  "meeting_title" text NOT NULL,
  "meeting_started_at" timestamptz NOT NULL,
  "meeting_ended_at" timestamptz,
  "meeting_duration_minutes" integer,

  -- Provenance from Google Drive. The dedup index uses (org, drive_file_id)
  -- so a re-run of the Apps Script doesn't duplicate rows.
  "drive_file_id" text NOT NULL,
  "drive_file_url" text NOT NULL,
  "drive_file_name" text,
  "drive_file_sha256" varchar(64),

  -- Roster: array of {name, email, joinTimeIso, leaveTimeIso, durationMinutes, role}.
  "attendees_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "attendee_count" integer NOT NULL DEFAULT 0,

  -- Linkage to the matched entity. Nullable — unmatched rows are still
  -- valuable as raw provenance even if we can't auto-attach.
  "match_kind" text,
  "match_id" uuid,
  "match_tag" text,
  "match_confidence" text,
  "matched_at" timestamptz,

  -- Audit + debugging.
  "imported_by_caller" text NOT NULL,
  "imported_by_email" text,
  "raw_payload_json" jsonb,

  "created_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "meeting_attendance_imports_source_chk"
    CHECK ("source" IN ('google_meet', 'teams', 'zoom')),
  CONSTRAINT "meeting_attendance_imports_match_kind_chk"
    CHECK ("match_kind" IS NULL OR "match_kind" IN ('ir_tabletop', 'ra', 'ca')),
  CONSTRAINT "meeting_attendance_imports_match_confidence_chk"
    CHECK ("match_confidence" IS NULL OR "match_confidence" IN ('tag_exact', 'tag_fuzzy', 'unmatched'))
);

CREATE INDEX IF NOT EXISTS "meeting_attendance_imports_org_date_idx"
  ON "meeting_attendance_imports" ("organization_id", "meeting_started_at" DESC);

CREATE INDEX IF NOT EXISTS "meeting_attendance_imports_match_idx"
  ON "meeting_attendance_imports" ("match_kind", "match_id");

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendance_imports_drive_dedup_idx"
  ON "meeting_attendance_imports" ("organization_id", "drive_file_id");
