/**
 * Apply migration 0077 (meeting_attendance_imports) — same
 * hand-written-SQL pattern as the other apply-*-migration scripts.
 *
 * Statements mirror drizzle/0077_meeting_attendance_imports.sql verbatim.
 * Keep in sync — if you change one, change the other.
 *
 * Run: DATABASE_URL='postgresql://…' npx tsx src/scripts/apply-meeting-attendance-migration.ts
 */

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const STMTS: { label: string; sql: string }[] = [
  {
    label: "0077 meeting_attendance_imports table",
    sql: `CREATE TABLE IF NOT EXISTS "meeting_attendance_imports" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "source" text NOT NULL DEFAULT 'google_meet',
      "meeting_title" text NOT NULL,
      "meeting_started_at" timestamptz NOT NULL,
      "meeting_ended_at" timestamptz,
      "meeting_duration_minutes" integer,
      "drive_file_id" text NOT NULL,
      "drive_file_url" text NOT NULL,
      "drive_file_name" text,
      "drive_file_sha256" varchar(64),
      "attendees_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "attendee_count" integer NOT NULL DEFAULT 0,
      "match_kind" text,
      "match_id" uuid,
      "match_tag" text,
      "match_confidence" text,
      "matched_at" timestamptz,
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
    )`,
  },
  {
    label: "0077 meeting_attendance_imports_org_date_idx",
    sql: `CREATE INDEX IF NOT EXISTS "meeting_attendance_imports_org_date_idx"
      ON "meeting_attendance_imports" ("organization_id", "meeting_started_at" DESC)`,
  },
  {
    label: "0077 meeting_attendance_imports_match_idx",
    sql: `CREATE INDEX IF NOT EXISTS "meeting_attendance_imports_match_idx"
      ON "meeting_attendance_imports" ("match_kind", "match_id")`,
  },
  {
    label: "0077 meeting_attendance_imports_drive_dedup_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendance_imports_drive_dedup_idx"
      ON "meeting_attendance_imports" ("organization_id", "drive_file_id")`,
  },
];

async function main() {
  let appliedCount = 0;
  for (const stmt of STMTS) {
    try {
      await sql.unsafe(stmt.sql);
      console.log(`✓ ${stmt.label}`);
      appliedCount++;
    } catch (err) {
      console.error(`✗ ${stmt.label}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  console.log(`\nApplied ${appliedCount} statement(s).`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
