/**
 * POST /api/risk-assessments/[id]/finalize
 *
 * Locks a risk_assessments row. Once finalized:
 *   - status flips to 'finalized'
 *   - the schema CHECK constraint enforces presence of hashes + period
 *   - subsequent edits to content fields throw at the API layer (this
 *     endpoint refuses to operate on a row that's already finalized;
 *     the supersession flow creates a NEW row instead)
 *   - the row's evidence is consumable by the readiness card
 *
 * Body shape (Zod-validated, strict — unknown fields rejected):
 *   {
 *     finalReportSha256: string (64 hex chars),
 *     packageSha256: string (64 hex chars),
 *     evidenceManifestSha256?: string (64 hex chars),
 *     vaultArtifactPointer?: string,
 *     immutableManifestPointer?: string,
 *     overrideObjectiveBNotApplicable?: boolean (admin override; default false)
 *   }
 *
 * Auth: Admin only (finalization is a sign-off action).
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  riskAssessments,
  governanceRegisterEntries,
  governanceRegisters,
  riskPoamLinks,
  riskAcceptances,
} from "@/db/schema";
import {
  authorizeRiskRequest,
  bridgeErrorResponse,
  FinalizeSchema,
  logRaAuditEvent,
} from "@/lib/risk-assessment-bridge";
import {
  blockerListForFinalize,
  evaluateObjectiveA,
  evaluateObjectiveB,
  TERMINAL_STATUSES,
} from "@/lib/risk-assessment/lifecycle";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Read raw body once — HMAC verification needs the exact bytes the
  // client signed; Zod parses the same string. Don't req.json() before
  // this or the body stream is gone.
  const rawBody = await req.text();

  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  let parsed: ReturnType<typeof FinalizeSchema.safeParse>;
  try {
    auth = await authorizeRiskRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = FinalizeSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
  const orgId = auth.organizationId;

  const [row] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(eq(riskAssessments.id, id), eq(riskAssessments.organizationId, orgId)),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (TERMINAL_STATUSES.includes(row.status as "finalized" | "superseded")) {
    return NextResponse.json(
      {
        error: `Already ${row.status}. Create a new assessment to supersede this one.`,
        currentStatus: row.status,
        finalizedAt: row.finalizedAt,
      },
      { status: 409 },
    );
  }

  // Evaluate objectives.
  const objA = evaluateObjectiveA(row);
  const objB = await evaluateObjectiveB(row);

  // Unresolved high/critical risks WITHOUT a treatment record.
  // "No treatment record" means: not in risk_poam_links AND not in risk_acceptances.
  const unresolved = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM ${governanceRegisterEntries} gre
    JOIN ${governanceRegisters} gr ON gr.id = gre.register_id
    WHERE gr.organization_id = ${orgId}
      AND gr.register_key = 'risk_register'
      AND gre.entry_data ->> 'assessment_id' = ${row.assessmentPivotId}
      AND gre.status = 'final'
      AND lower(gre.entry_data ->> 'impact') IN ('high', 'critical')
      AND NOT EXISTS (
        SELECT 1 FROM ${riskPoamLinks} rpl
        WHERE rpl.risk_assessment_id = ${row.id}
          AND rpl.risk_external_id = gre.entry_data ->> 'risk_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${riskAcceptances} ra
        WHERE ra.risk_assessment_id = ${row.id}
          AND ra.risk_external_id = gre.entry_data ->> 'risk_id'
      )
  `);
  const unresolvedCount = Number(
    (unresolved as unknown as { rows: { n: number }[] }).rows?.[0]?.n ?? 0,
  );

  const blockers = blockerListForFinalize(row, {
    unresolvedHighCriticalWithoutTreatment: unresolvedCount,
    finalReportSha256: parsed.data.finalReportSha256,
    packageSha256: parsed.data.packageSha256,
    evidenceManifestSha256: parsed.data.evidenceManifestSha256 ?? null,
    vaultArtifactPointer: parsed.data.vaultArtifactPointer ?? row.vaultArtifactPointer,
    objectiveA: objA.status,
    objectiveB: parsed.data.overrideObjectiveBNotApplicable
      ? "not_applicable"
      : objB.status,
  });

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot finalize — gates failed.",
        blockers,
        objectiveA: objA,
        objectiveB: objB,
        unresolvedHighCriticalWithoutTreatment: unresolvedCount,
      },
      { status: 409 },
    );
  }

  // ── Flip to finalized ─────────────────────────────────────────
  const [updated] = await db
    .update(riskAssessments)
    .set({
      status: "finalized",
      finalizedAt: new Date(),
      finalReportSha256: parsed.data.finalReportSha256,
      packageSha256: parsed.data.packageSha256,
      evidenceManifestSha256: parsed.data.evidenceManifestSha256 ?? null,
      vaultArtifactPointer:
        parsed.data.vaultArtifactPointer ?? row.vaultArtifactPointer,
      immutableManifestPointer:
        parsed.data.immutableManifestPointer ?? row.immutableManifestPointer,
      objectiveAStatus: objA.status,
      objectiveARationale: objA.rationale,
      objectiveBStatus: parsed.data.overrideObjectiveBNotApplicable
        ? "not_applicable"
        : objB.status,
      objectiveBRationale: parsed.data.overrideObjectiveBNotApplicable
        ? "Marked not_applicable by admin override at finalization."
        : objB.rationale,
      approvedByUserId: row.approvedByUserId ?? auth.userId,
      approvedAt: row.approvedAt ?? new Date(),
    })
    .where(eq(riskAssessments.id, row.id))
    .returning();

  // Mark any older finalized assessment for this org as superseded.
  await db
    .update(riskAssessments)
    .set({
      status: "superseded",
      supersededAt: new Date(),
      supersededByAssessmentId: updated.id,
    })
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
        sql`${riskAssessments.id} <> ${updated.id}`,
      ),
    );

  await logRaAuditEvent({
    organizationId: orgId,
    userId: auth.userId,
    action: "risk_assessment.finalized",
    resourceType: "risk_assessment",
    resourceId: updated.id,
    details: {
      assessmentPivotId: updated.assessmentPivotId,
      finalReportSha256: updated.finalReportSha256,
      packageSha256: updated.packageSha256,
      objectiveA: updated.objectiveAStatus,
      objectiveB: updated.objectiveBStatus,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
      controlId: "3.11.1",
    },
    req,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/readiness");
  revalidatePath("/dashboard/controls/3.11.1");

  return NextResponse.json({
    ok: true,
    assessment: {
      id: updated.id,
      status: updated.status,
      finalizedAt: updated.finalizedAt,
      objectiveA: updated.objectiveAStatus,
      objectiveB: updated.objectiveBStatus,
      finalReportSha256: updated.finalReportSha256,
      packageSha256: updated.packageSha256,
    },
  });
}
