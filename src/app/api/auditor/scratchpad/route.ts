import { NextResponse } from "next/server";
import { db } from "@/db";
import { assessorScratchpads, assessments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * POST /api/auditor/scratchpad
 *
 * Phase 10 — autosave endpoint for the AssessorScratchpad client. Upserts
 * one row per (assessment_id, control_id). Body:
 *   { assessment_id, control_id, notes, assessor_verdict? }
 *
 * Authorization: any authenticated user in the org. The assessment must
 * be open AND belong to the caller's org. Phase 10 follow-up adds an
 * Auditor role gate; for now the assessment-open + org-match check is
 * the boundary.
 */

interface Body {
  assessment_id?: string;
  control_id?: string;
  notes?: string;
  assessor_verdict?: string | null;
}

const VALID_VERDICTS = new Set(["satisfies", "partial", "gap", "not_applicable"]);

export async function POST(req: Request) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.assessment_id || !body.control_id) {
    return NextResponse.json(
      { error: "assessment_id and control_id are required" },
      { status: 400 },
    );
  }
  if (
    body.assessor_verdict &&
    body.assessor_verdict !== null &&
    !VALID_VERDICTS.has(body.assessor_verdict)
  ) {
    return NextResponse.json(
      { error: `assessor_verdict must be one of ${Array.from(VALID_VERDICTS).join(", ")} or null` },
      { status: 400 },
    );
  }

  // Verify the assessment exists, belongs to this org, and is still open.
  const [assessment] = await db
    .select({
      id: assessments.id,
      status: assessments.status,
      organizationId: assessments.organizationId,
    })
    .from(assessments)
    .where(eq(assessments.id, body.assessment_id))
    .limit(1);
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }
  if (assessment.organizationId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (assessment.status !== "open") {
    return NextResponse.json(
      { error: "Assessment is not open — scratchpad is read-only after close-out" },
      { status: 409 },
    );
  }

  const now = new Date();
  const notes = body.notes ?? "";
  const verdict = body.assessor_verdict ?? null;

  // Upsert (one row per (assessment, control)).
  const [existing] = await db
    .select({ id: assessorScratchpads.id })
    .from(assessorScratchpads)
    .where(
      and(
        eq(assessorScratchpads.assessmentId, body.assessment_id),
        eq(assessorScratchpads.controlId, body.control_id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(assessorScratchpads)
      .set({
        notes,
        assessorVerdict: verdict,
        lastEditedAt: now,
        lastEditedByUserId: userId,
      })
      .where(eq(assessorScratchpads.id, existing.id));
  } else {
    await db.insert(assessorScratchpads).values({
      assessmentId: body.assessment_id,
      organizationId: orgId,
      controlId: body.control_id,
      notes,
      assessorVerdict: verdict,
      lastEditedAt: now,
      lastEditedByUserId: userId,
    });
  }

  return NextResponse.json({ ok: true, last_edited_at: now.toISOString() });
}
