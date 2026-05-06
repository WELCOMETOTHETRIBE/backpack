import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  assessments,
  controlObservedImplementations,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/admin/assessments
 *
 * Phase 10 — open a new C3PAO assessment session.
 *
 * Body: { title, assessor_name?, assessor_org?, assessor_email? }
 *
 * Side effect: fans out narrative_lock_started_at +
 * narrative_lock_assessment_id onto every control_observed_implementations
 * row whose lock is currently NULL. The OIS regenerator (Phase 6) skips
 * locked rows on subsequent ingests, so the C3PAO sees a stable narrative
 * for the duration of the assessment.
 *
 * Auth: session, Admin or Compliance role.
 */

interface OpenAssessmentBody {
  title?: string;
  assessor_name?: string | null;
  assessor_org?: string | null;
  assessor_email?: string | null;
}

export async function POST(req: Request) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "Admin" && role !== "Compliance") {
    return NextResponse.json(
      { error: "Forbidden — only Admin or Compliance roles may open an assessment" },
      { status: 403 },
    );
  }

  let body: OpenAssessmentBody;
  try {
    body = (await req.json()) as OpenAssessmentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.title || body.title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const now = new Date();
  const [created] = await db
    .insert(assessments)
    .values({
      organizationId: orgId,
      title: body.title.trim(),
      status: "open",
      openedAt: now,
      openedByUserId: userId,
      assessorName: body.assessor_name ?? null,
      assessorOrg: body.assessor_org ?? null,
      assessorEmail: body.assessor_email ?? null,
    })
    .returning();

  // Fan out narrative locks onto every OIS row that's currently unlocked.
  // The lock prevents the OIS generator from refreshing the narrative
  // mid-assessment so the C3PAO sees a stable evidence picture.
  const lockResult = await db
    .update(controlObservedImplementations)
    .set({
      narrativeLockStartedAt: now,
      narrativeLockAssessmentId: created.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        isNull(controlObservedImplementations.narrativeLockStartedAt),
      ),
    )
    .returning({ id: controlObservedImplementations.id });

  try {
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "codex.assessment.opened",
      resourceType: "assessment",
      resourceId: created.id,
      details: {
        title: created.title,
        assessor_name: created.assessorName,
        assessor_org: created.assessorOrg,
        narratives_locked: lockResult.length,
      },
    });
  } catch {
    // No-op
  }

  return NextResponse.json({
    ok: true,
    assessment_id: created.id,
    narratives_locked: lockResult.length,
  });
}
