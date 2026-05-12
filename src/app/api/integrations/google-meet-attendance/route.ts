/**
 * POST /api/integrations/google-meet-attendance
 *
 * Inbound attendance ingest from the Apps Script in
 * scripts/google-meet-attendance/Code.gs. The script watches the
 * Drive folder Google drops attendance reports into and POSTs each
 * new file's parsed roster here.
 *
 * Auth: Bearer + HMAC + org header — see src/lib/google-meet-bridge.ts.
 *
 * ⚠ IR-specific architecture note:
 *   The IR Tabletop bundle ZIP is built and uploaded to Azure Gov by
 *   TrainOS, NOT by Codex. Codex only ever holds the manifest +
 *   sha256s — never the bundle bytes. That means if Codex stamps
 *   ir_exercise_bundles.attendance_corroboration_file_sha256 from the
 *   Google Meet CSV, it's claiming a hash for a file that never made
 *   it into the bundle ZIP a C3PAO would download. False-positive
 *   evidence claim. So this route does NOT stamp the bundle.
 *
 *   The correct path for IR is: Apps Script → TrainOS attendance
 *   ingest endpoint → TrainOS attaches CSV to the working bundle ZIP
 *   → uploads to Azure Gov → POSTs the new manifest to Codex via the
 *   existing IR bridge. See scripts/google-meet-attendance/TRAINOS_HANDOFF.md
 *   for the spec the TrainOS team needs to build.
 *
 *   Until that's wired up, IR attendance lands here as raw provenance
 *   (meeting_attendance_imports row), participants are marked
 *   attended on Codex's mirror table (used by the dashboard), and the
 *   canonical rescore fires — but the C3PAO-facing bundle stays
 *   uncorroborated until TrainOS owns the file.
 *
 * Match logic:
 *   1. Pull [CDX-{kind}-{8charPrefix}] tag from meetingTitle
 *   2. kind ∈ {IR, RA, CA} — look up entity by uuid prefix
 *   3. On IR match:
 *        - Record the meeting_attendance_imports row (provenance)
 *        - Update ir_exercise_participants.attended_at by email
 *          (Codex's local mirror — TrainOS becomes canonical writer
 *          once the TrainOS endpoint ships)
 *        - Fire scoreControlsAffectedBy for IR.L2-3.6.1/2/3
 *        - Bundle stamping deliberately NOT done here — see note above
 *   4. On RA / CA match: record the import + audit log. RA + CA
 *      bundles are Codex-native (built from controls/cycles), so the
 *      direct path is correct here. Auto-attachment can be added
 *      when those flows define a participant model.
 *   5. No tag / no match: row stored unmatched. Not a failure.
 *
 * Idempotency: (organization_id, drive_file_id) is a unique index, so
 * a re-run of the Apps Script (e.g. during retry) returns 200 with
 * action='already_imported' instead of duplicating rows.
 */

import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  auditLogs,
  meetingAttendanceImports,
  riskAssessments,
  caAssessmentBundles,
} from "@/db/schema";
import { irExercises, irExerciseParticipants } from "@/db/schema.ir-tabletop";
import {
  BridgeAuthError,
  BRIDGE_CONTRACT_VERSION,
  GoogleMeetAttendancePayloadSchema,
  parseAssessmentTag,
  verifyGoogleMeetRequest,
} from "@/lib/google-meet-bridge";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

// IR.L2-3.6.x — fired when we successfully attach attendance to an IR
// exercise. Same posture as the existing scoring sweeps: best-effort,
// non-blocking on the persisted import row.
const IR_CONTROL_IDS = ["3.6.1", "3.6.2", "3.6.3"];

export async function POST(req: Request) {
  // Read raw bytes so HMAC verification hashes the exact same string
  // the client signed (re-stringifying via JSON.parse would re-order
  // keys and break the signature).
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return errorEnvelope({ error: "Failed to read request body" }, 400);
  }

  let auth;
  try {
    auth = await verifyGoogleMeetRequest(req, rawBody);
  } catch (e) {
    if (e instanceof BridgeAuthError) {
      return errorEnvelope({ error: e.message }, e.statusCode);
    }
    return errorEnvelope(
      { error: e instanceof Error ? e.message : "Auth failed" },
      401,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorEnvelope({ error: "Body is not valid JSON" }, 400);
  }

  const parsed = GoogleMeetAttendancePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return errorEnvelope(
      { error: "Validation failed", issues: parsed.error.issues },
      400,
    );
  }
  const payload = parsed.data;

  // Dedup check — (org, drive_file_id) is unique. Re-runs of the
  // Apps Script are common (e.g. on retry after a transient failure)
  // and must be idempotent.
  const [existing] = await db
    .select({
      id: meetingAttendanceImports.id,
      matchKind: meetingAttendanceImports.matchKind,
      matchId: meetingAttendanceImports.matchId,
    })
    .from(meetingAttendanceImports)
    .where(
      and(
        eq(meetingAttendanceImports.organizationId, auth.organizationId),
        eq(meetingAttendanceImports.driveFileId, payload.driveFileId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({
      ok: true,
      action: "already_imported",
      importId: existing.id,
      matchKind: existing.matchKind,
      matchId: existing.matchId,
      contractVersion: BRIDGE_CONTRACT_VERSION,
    });
  }

  // Match the meeting title tag → entity.
  const tag = parseAssessmentTag(payload.meetingTitle);
  let matchKind: "ir_tabletop" | "ra" | "ca" | null = null;
  let matchId: string | null = null;
  let matchConfidence: "tag_exact" | "unmatched" = "unmatched";

  if (tag) {
    const resolved = await resolveEntityByPrefix(
      auth.organizationId,
      tag.kind,
      tag.idPrefix,
    );
    if (resolved) {
      matchKind = tag.kind;
      matchId = resolved;
      matchConfidence = "tag_exact";
    }
  }

  // Persist the import row first (single source of truth) — the IR
  // side-effects below are best-effort on top of this commit.
  const [imp] = await db
    .insert(meetingAttendanceImports)
    .values({
      organizationId: auth.organizationId,
      source: "google_meet",
      meetingTitle: payload.meetingTitle,
      meetingStartedAt: new Date(payload.meetingStartedAt),
      meetingEndedAt: payload.meetingEndedAt ? new Date(payload.meetingEndedAt) : null,
      meetingDurationMinutes: payload.meetingDurationMinutes ?? null,
      driveFileId: payload.driveFileId,
      driveFileUrl: payload.driveFileUrl,
      driveFileName: payload.driveFileName ?? null,
      driveFileSha256: payload.driveFileSha256 ?? null,
      attendeesJson: payload.attendees,
      attendeeCount: payload.attendees.length,
      matchKind,
      matchId,
      matchTag: tag?.raw ?? null,
      matchConfidence,
      matchedAt: matchKind ? new Date() : null,
      importedByCaller: auth.caller,
      importedByEmail: auth.userEmail,
      // Stash the entire payload for debugging. sha256 of the canonical
      // JSON is in driveFileSha256 already, so duplication is fine.
      rawPayloadJson: payload as unknown as Record<string, unknown>,
    })
    .returning();

  const sideEffects: {
    irParticipantsUpdated: number;
    rescoreFired: boolean;
  } = {
    irParticipantsUpdated: 0,
    rescoreFired: false,
  };

  // ── IR Tabletop side effects ──
  // NOTE: bundle stamping is intentionally absent — see the file
  // header. The bundle ZIP is built by TrainOS, so stamping a sha256
  // for a CSV that never makes it into the ZIP would be a false
  // evidence claim. Once TrainOS exposes its attendance ingest
  // (TRAINOS_HANDOFF.md), the Apps Script will route IR there and
  // this branch becomes a fallback for the operator-driven case.
  if (matchKind === "ir_tabletop" && matchId) {
    try {
      sideEffects.irParticipantsUpdated = await markIrParticipantsAttended(
        matchId,
        payload.attendees,
        new Date(payload.meetingStartedAt),
      );
    } catch (err) {
      console.error("[google-meet-attendance] IR participant update failed:", err);
    }

    try {
      await scoreControlsAffectedBy({
        organizationId: auth.organizationId,
        triggerSource: "ir_bundle_archived",
        controlIds: IR_CONTROL_IDS,
        triggeredByUserId: null,
      });
      sideEffects.rescoreFired = true;
    } catch (err) {
      console.error("[google-meet-attendance] IR rescore failed:", err);
    }
  }

  // Audit log — every import gets one, matched or not.
  try {
    await db.insert(auditLogs).values({
      organizationId: auth.organizationId,
      userId: null,
      action: "google_meet_attendance_imported",
      resourceType: "meeting_attendance_import",
      resourceId: imp.id,
      details: {
        meetingTitle: payload.meetingTitle,
        driveFileId: payload.driveFileId,
        attendeeCount: payload.attendees.length,
        matchKind,
        matchId,
        matchTag: tag?.raw ?? null,
        sideEffects,
        caller: auth.caller,
      },
    });
  } catch (err) {
    console.error("[google-meet-attendance] audit log failed:", err);
  }

  return NextResponse.json({
    ok: true,
    action: "imported",
    importId: imp.id,
    matchKind,
    matchId,
    matchTag: tag?.raw ?? null,
    matchConfidence,
    attendeeCount: payload.attendees.length,
    sideEffects,
    contractVersion: BRIDGE_CONTRACT_VERSION,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function errorEnvelope(body: object, status: number) {
  return NextResponse.json(
    { ...body, contractVersion: BRIDGE_CONTRACT_VERSION },
    { status },
  );
}

/**
 * Looks up an entity by id-prefix within an org. Postgres uuid → text
 * cast then prefix compare. Bounded scan because (organization_id, id)
 * is small per-org and the prefix narrows further.
 */
async function resolveEntityByPrefix(
  orgId: string,
  kind: "ir_tabletop" | "ra" | "ca",
  idPrefix: string,
): Promise<string | null> {
  const prefix = idPrefix.toLowerCase();
  if (kind === "ir_tabletop") {
    const [row] = await db
      .select({ id: irExercises.id })
      .from(irExercises)
      .where(
        and(
          eq(irExercises.organizationId, orgId),
          sql`substring(${irExercises.id}::text from 1 for 8) = ${prefix}`,
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }
  if (kind === "ra") {
    const [row] = await db
      .select({ id: riskAssessments.id })
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.organizationId, orgId),
          sql`substring(${riskAssessments.id}::text from 1 for 8) = ${prefix}`,
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }
  if (kind === "ca") {
    const [row] = await db
      .select({ id: caAssessmentBundles.id })
      .from(caAssessmentBundles)
      .where(
        and(
          eq(caAssessmentBundles.organizationId, orgId),
          sql`substring(${caAssessmentBundles.id}::text from 1 for 8) = ${prefix}`,
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }
  return null;
}

/**
 * For each attendee with a matchable email on the exercise's
 * participant list, set attended_at to the meeting start. Returns the
 * count of rows updated.
 *
 * Match strategy: case-insensitive email match. Name-only attendees
 * (no email) are intentionally skipped — name matching is too brittle
 * for an evidence pipeline a C3PAO will inspect.
 */
async function markIrParticipantsAttended(
  exerciseId: string,
  attendees: Array<z.infer<typeof GoogleMeetAttendancePayloadSchema>["attendees"][number]>,
  meetingStartedAt: Date,
): Promise<number> {
  const emails = attendees
    .map((a) => a.email?.toLowerCase().trim())
    .filter((e): e is string => Boolean(e));
  if (emails.length === 0) return 0;

  let updated = 0;
  for (const email of emails) {
    const result = await db
      .update(irExerciseParticipants)
      .set({ attendedAt: meetingStartedAt })
      .where(
        and(
          eq(irExerciseParticipants.exerciseId, exerciseId),
          sql`lower(${irExerciseParticipants.email}) = ${email}`,
        ),
      )
      .returning({ id: irExerciseParticipants.id });
    updated += result.length;
  }
  return updated;
}

