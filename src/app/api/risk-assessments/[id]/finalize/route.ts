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
import { z } from "zod";

import { db } from "@/db";
import {
  riskAssessments,
  governanceRegisterEntries,
  governanceRegisters,
  riskPoamLinks,
  riskAcceptances,
} from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  blockerListForFinalize,
  evaluateObjectiveA,
  evaluateObjectiveB,
  TERMINAL_STATUSES,
} from "@/lib/risk-assessment/lifecycle";

const SHA256_RE = /^[a-f0-9]{64}$/i;

const FinalizeSchema = z
  .object({
    finalReportSha256: z.string().regex(SHA256_RE),
    packageSha256: z.string().regex(SHA256_RE),
    evidenceManifestSha256: z.string().regex(SHA256_RE).optional(),
    vaultArtifactPointer: z.string().min(1).optional(),
    immutableManifestPointer: z.string().min(1).optional(),
    overrideObjectiveBNotApplicable: z.boolean().optional(),
  })
  .strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = FinalizeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

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
      approvedByUserId: row.approvedByUserId ?? user.id,
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

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "risk_assessment.finalized",
    resourceType: "risk_assessment",
    resourceId: updated.id,
    details: {
      assessmentPivotId: updated.assessmentPivotId,
      finalReportSha256: updated.finalReportSha256,
      packageSha256: updated.packageSha256,
      objectiveA: updated.objectiveAStatus,
      objectiveB: updated.objectiveBStatus,
      controlId: "3.11.1",
    },
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
