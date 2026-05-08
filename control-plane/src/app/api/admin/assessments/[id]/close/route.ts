import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  assessments,
  controlObservedImplementations,
  controlAdjudicationSnapshots,
  assessorScratchpads,
  threatNarratives,
} from "@/db/schema";
import { and, eq, sql, desc, isNotNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import crypto from "node:crypto";

/**
 * POST /api/admin/assessments/[id]/close
 *
 * Phase 10 close-out flow + B3 signed receipt.
 *
 * Body: { closeout_summary?, assessor_signature? }
 *
 * Side effects:
 *   1. Snapshot every (control, OIS narrative, CAE verdict, scratchpad
 *      notes + assessor verdict) into assessment_closeout_receipts
 *      payload. SHA-256 of the canonical JSON is stored alongside —
 *      tamper-evident artifact the C3PAO leaves with.
 *   2. Flip assessment.status to "closed", set closed_at + closed_by.
 *   3. Clear narrative_lock_* on every controlObservedImplementations row
 *      whose lock matches THIS assessment_id. OIS regen resumes on next
 *      ingest.
 *   4. Audit log codex.assessment.closed.
 *
 * Auth: session, Admin or Compliance role. Assessment must be open.
 */

interface CloseAssessmentBody {
  closeout_summary?: string | null;
  assessor_signature?: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      { error: "Forbidden — only Admin or Compliance roles may close an assessment" },
      { status: 403 },
    );
  }

  const { id: assessmentId } = await params;

  let body: CloseAssessmentBody;
  try {
    body = (await req.json()) as CloseAssessmentBody;
  } catch {
    body = {};
  }

  // Resolve + verify assessment.
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }
  if (assessment.organizationId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (assessment.status !== "open") {
    return NextResponse.json(
      { error: `Assessment is ${assessment.status}; only open assessments can be closed` },
      { status: 409 },
    );
  }

  const now = new Date();

  // ── Build the close-out receipt payload ─────────────────────────────
  // Snapshot every locked narrative + every CAE verdict + every scratchpad
  // + every active threat narrative into one canonical JSON. This is the
  // tamper-evident artifact the C3PAO leaves with.

  const lockedNarratives = await db
    .select()
    .from(controlObservedImplementations)
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        eq(
          controlObservedImplementations.narrativeLockAssessmentId,
          assessmentId,
        ),
      ),
    );

  // Latest CAE snapshot per control (one row per (control, manifest)).
  // We grab everything for the org, then dedupe to most-recent-per-control
  // in JS — same approach as scorer.ts/getLatestAdjudicationsForOrg.
  const allSnapshots = await db
    .select()
    .from(controlAdjudicationSnapshots)
    .where(eq(controlAdjudicationSnapshots.organizationId, orgId))
    .orderBy(desc(controlAdjudicationSnapshots.computedAt));
  const latestSnapshotPerControl = new Map<
    string,
    typeof controlAdjudicationSnapshots.$inferSelect
  >();
  for (const s of allSnapshots) {
    if (!latestSnapshotPerControl.has(s.controlId))
      latestSnapshotPerControl.set(s.controlId, s);
  }

  const scratchpads = await db
    .select()
    .from(assessorScratchpads)
    .where(eq(assessorScratchpads.assessmentId, assessmentId));

  const narrativesActive = await db
    .select()
    .from(threatNarratives)
    .where(
      and(
        eq(threatNarratives.organizationId, orgId),
        isNotNull(threatNarratives.openedAt),
      ),
    )
    .orderBy(desc(threatNarratives.lastObservedAt))
    .limit(100);

  // Per-control rollup. The C3PAO's view of the receipt is one entry per
  // control with everything that mattered: the locked narrative they
  // adjudicated against, the engine's verdict, their own scratchpad
  // recommendation, and the contributing entry IDs from the engine.
  const controlsRollup = lockedNarratives.map((ois) => {
    const snap = latestSnapshotPerControl.get(ois.controlId) ?? null;
    const pad = scratchpads.find((p) => p.controlId === ois.controlId) ?? null;
    return {
      control_id: ois.controlId,
      implementation_narrative: ois.narrative,
      narrative_period_start: ois.periodStart,
      narrative_period_end: ois.periodEnd,
      narrative_generated_from_manifest_id: ois.generatedFromManifestId,
      narrative_most_recent_evidence_at: ois.mostRecentEvidenceAt,
      cae_status: snap?.status ?? null,
      cae_confidence: snap?.confidence ?? null,
      cae_requirements: snap?.requirementsJson ?? [],
      cae_computed_at: snap?.computedAt ?? null,
      assessor_verdict: pad?.assessorVerdict ?? null,
      assessor_notes: pad?.notes ?? null,
      assessor_last_edited_at: pad?.lastEditedAt ?? null,
    };
  });

  const payload = {
    schema: "mactech.cmmc.assessment-closeout-receipt.v1",
    organization_id: orgId,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      assessor_name: assessment.assessorName,
      assessor_org: assessment.assessorOrg,
      assessor_email: assessment.assessorEmail,
      opened_at: assessment.openedAt,
      opened_by_user_id: assessment.openedByUserId,
      closed_at: now,
      closed_by_user_id: userId,
      closeout_summary: body.closeout_summary ?? null,
      assessor_signature: body.assessor_signature ?? null,
    },
    controls: controlsRollup,
    threat_narratives: narrativesActive.map((n) => ({
      id: n.id,
      narrative_type: n.narrativeType,
      summary: n.summary,
      confidence: n.confidence,
      status: n.status,
      opened_at: n.openedAt,
      last_observed_at: n.lastObservedAt,
      related_entry_ids: n.relatedEntryIds,
    })),
    counts: {
      controls_in_receipt: controlsRollup.length,
      cae_satisfies: controlsRollup.filter((c) => c.cae_status === "satisfies").length,
      cae_partial: controlsRollup.filter((c) => c.cae_status === "partial").length,
      cae_at_risk: controlsRollup.filter((c) => c.cae_status === "at_risk").length,
      cae_gap: controlsRollup.filter((c) => c.cae_status === "gap").length,
      assessor_satisfies: controlsRollup.filter((c) => c.assessor_verdict === "satisfies").length,
      assessor_partial: controlsRollup.filter((c) => c.assessor_verdict === "partial").length,
      assessor_gap: controlsRollup.filter((c) => c.assessor_verdict === "gap").length,
      assessor_n_a: controlsRollup.filter((c) => c.assessor_verdict === "not_applicable").length,
      threat_narratives_recorded: narrativesActive.length,
    },
    generated_at: now,
  };

  // Canonical JSON for hashing. JSON.stringify is sufficient — the
  // sort order is deterministic for our object shape (we control the
  // keys; no Map-style reordering risk).
  const canonical = JSON.stringify(payload);
  const payloadHash = crypto
    .createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");

  // Persist receipt + close out.
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO assessment_closeout_receipts
        (assessment_id, organization_id, generated_at, generated_by_user_id, payload, payload_hash, assessor_signature)
      VALUES
        (${assessmentId}, ${orgId}, ${now}, ${userId}, ${canonical}::jsonb, ${payloadHash}, ${body.assessor_signature ?? null})
    `);

    await tx
      .update(assessments)
      .set({
        status: "closed",
        closedAt: now,
        closedByUserId: userId,
        closeoutSummary: body.closeout_summary ?? null,
        updatedAt: now,
      })
      .where(eq(assessments.id, assessmentId));

    // Clear narrative locks scoped to this assessment.
    await tx
      .update(controlObservedImplementations)
      .set({
        narrativeLockStartedAt: null,
        narrativeLockAssessmentId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(controlObservedImplementations.organizationId, orgId),
          eq(
            controlObservedImplementations.narrativeLockAssessmentId,
            assessmentId,
          ),
        ),
      );
  });

  try {
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "codex.assessment.closed",
      resourceType: "assessment",
      resourceId: assessmentId,
      details: {
        title: assessment.title,
        assessor_name: assessment.assessorName,
        controls_in_receipt: payload.counts.controls_in_receipt,
        cae_satisfies: payload.counts.cae_satisfies,
        cae_gap: payload.counts.cae_gap,
        assessor_satisfies: payload.counts.assessor_satisfies,
        assessor_gap: payload.counts.assessor_gap,
        payload_hash: payloadHash,
      },
    });
  } catch {
    // No-op
  }

  return NextResponse.json({
    ok: true,
    assessment_id: assessmentId,
    payload_hash: payloadHash,
    counts: payload.counts,
    closed_at: now.toISOString(),
  });
}
