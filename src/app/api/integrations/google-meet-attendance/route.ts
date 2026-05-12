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
 * Match logic:
 *   1. Pull [CDX-{kind}-{8charPrefix}] tag from meetingTitle
 *   2. kind ∈ {IR, RA, CA} — look up entity by uuid prefix
 *   3. On IR match:
 *        - Update ir_exercise_participants.attended_at by email
 *        - Stamp the latest provisional bundle (if any) with
 *          attendance_corroboration_kind='google_meet_csv' +
 *          attendance_corroboration_file_sha256 + the seal deadline
 *        - Fire scoreControlsAffectedBy for IR.L2-3.6.1/2/3
 *   4. On RA / CA match: record the import + audit log; no
 *      automated attachment yet (those entities don't have a
 *      participant model). Visible from the dashboard for manual
 *      reconciliation.
 *   5. No tag / no match: row stored unmatched. Not a failure.
 *
 * Idempotency: (organization_id, drive_file_id) is a unique index, so
 * a re-run of the Apps Script (e.g. during retry) returns 200 with
 * action='already_imported' instead of duplicating rows.
 */

import { createHash } from "node:crypto";
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
import { irExercises, irExerciseParticipants, irExerciseBundles } from "@/db/schema.ir-tabletop";
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
    bundleStamped: boolean;
    rescoreFired: boolean;
  } = {
    irParticipantsUpdated: 0,
    bundleStamped: false,
    rescoreFired: false,
  };

  // ── IR Tabletop side effects ──
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
      sideEffects.bundleStamped = await stampLatestProvisionalBundle(
        matchId,
        payload.driveFileSha256 ?? deriveSha256FromPayload(rawBody),
      );
    } catch (err) {
      console.error("[google-meet-attendance] IR bundle stamp failed:", err);
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

/**
 * Stamp the latest provisional bundle (if any) with the Google Meet
 * corroboration metadata. If no provisional bundle exists yet, the
 * import row alone preserves provenance until TrainOS uploads one.
 */
async function stampLatestProvisionalBundle(
  exerciseId: string,
  sha256: string,
): Promise<boolean> {
  const [bundle] = await db
    .select({ id: irExerciseBundles.id })
    .from(irExerciseBundles)
    .where(
      and(
        eq(irExerciseBundles.exerciseId, exerciseId),
        eq(irExerciseBundles.bundleState, "provisional"),
      ),
    )
    .orderBy(sql`${irExerciseBundles.bundleVersion} DESC`)
    .limit(1);

  if (!bundle) return false;

  await db
    .update(irExerciseBundles)
    .set({
      attendanceCorroborationKind: "google_meet_csv",
      attendanceCorroborationFileSha256: sha256,
    })
    .where(eq(irExerciseBundles.id, bundle.id));

  return true;
}

function deriveSha256FromPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
