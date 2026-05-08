/**
 * POST /api/risk-assessments/[id]/risk-acceptances
 *
 * Creates an executive risk-acceptance record for a single risk inside
 * an assessment. The "skip POA&M" path under CMMC.
 *
 * Rules:
 *   - The parent risk_assessments row must belong to the caller's org.
 *   - It must NOT yet be finalized (acceptances feed into the
 *     finalize-blocker check; once finalized, the row is immutable).
 *   - For high / critical risks, the API requires an explicit
 *     executiveApproval=true flag in the payload AND the caller's role
 *     must be "Admin" (proxy for executive sign-off in this codebase's
 *     RBAC; mapped from customer_owner / customer_admin).
 *   - The risk_external_id must match a finalized row in the assessment's
 *     risk_register. If it doesn't, we 422 — the customer can't accept
 *     a risk that isn't in their register.
 *
 * Auth: Compliance + Admin can create low/medium acceptances; only
 * Admin can create high/critical acceptances (with executiveApproval).
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  riskAssessments,
  riskAcceptances,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { TERMINAL_STATUSES } from "@/lib/risk-assessment/lifecycle";

const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);

const AcceptSchema = z
  .object({
    riskExternalId: z.string().min(1).max(64),
    severity: SeverityEnum,
    residualRisk: SeverityEnum,
    acceptanceRationaleSummary: z.string().min(40).max(2000),
    approverDisplayName: z.string().min(2),
    approverRole: z.string().min(2).max(64).optional(),
    nextReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vaultPointer: z.string().min(1).optional(),
    acceptanceRecordHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    /**
     * Required for severity ∈ {high, critical}. Forces a deliberate
     * acknowledgement that an executive is signing off on a serious
     * residual risk.
     */
    executiveApproval: z.boolean().optional(),
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
    user = await requireRole(["Admin", "Compliance"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = AcceptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const isHighCritical = parsed.data.severity === "high" || parsed.data.severity === "critical";
  if (isHighCritical) {
    if (user.role !== "Admin") {
      return NextResponse.json(
        {
          error:
            "High/critical risk acceptance requires an Admin (executive) signer.",
        },
        { status: 403 },
      );
    }
    if (!parsed.data.executiveApproval) {
      return NextResponse.json(
        {
          error:
            "executiveApproval=true is required when accepting a high or critical risk.",
        },
        { status: 400 },
      );
    }
  }

  // Parent assessment must exist + belong to org + not be finalized.
  const [assessment] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(eq(riskAssessments.id, id), eq(riskAssessments.organizationId, orgId)),
    )
    .limit(1);
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (TERMINAL_STATUSES.includes(assessment.status as "finalized" | "superseded")) {
    return NextResponse.json(
      { error: `Assessment is ${assessment.status}; cannot mutate.` },
      { status: 409 },
    );
  }

  // The risk must exist in the register pinned to this assessment.
  const riskExists = await db.execute(sql`
    SELECT 1
    FROM ${governanceRegisterEntries} gre
    JOIN ${governanceRegisters} gr ON gr.id = gre.register_id
    WHERE gr.organization_id = ${orgId}
      AND gr.register_key = 'risk_register'
      AND gre.entry_data ->> 'assessment_id' = ${assessment.assessmentPivotId}
      AND gre.entry_data ->> 'risk_id' = ${parsed.data.riskExternalId}
      AND gre.status = 'final'
    LIMIT 1
  `);
  if (
    !(riskExists as unknown as { rows: unknown[] }).rows ||
    (riskExists as unknown as { rows: unknown[] }).rows.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Risk not found in the register for this assessment. Cannot accept a risk that isn't recorded.",
        riskExternalId: parsed.data.riskExternalId,
        assessmentPivotId: assessment.assessmentPivotId,
      },
      { status: 422 },
    );
  }

  // Insert / upsert.
  const [created] = await db
    .insert(riskAcceptances)
    .values({
      organizationId: orgId,
      riskAssessmentId: assessment.id,
      riskExternalId: parsed.data.riskExternalId,
      severity: parsed.data.severity,
      residualRisk: parsed.data.residualRisk,
      acceptanceRationaleSummary: parsed.data.acceptanceRationaleSummary,
      approverUserId: user.id,
      approverDisplayName: parsed.data.approverDisplayName,
      approverRole: parsed.data.approverRole ?? null,
      nextReviewDate: parsed.data.nextReviewDate,
      vaultPointer: parsed.data.vaultPointer ?? null,
      acceptanceRecordHash: parsed.data.acceptanceRecordHash ?? null,
    })
    .onConflictDoUpdate({
      target: [riskAcceptances.riskAssessmentId, riskAcceptances.riskExternalId],
      set: {
        severity: parsed.data.severity,
        residualRisk: parsed.data.residualRisk,
        acceptanceRationaleSummary: parsed.data.acceptanceRationaleSummary,
        approverUserId: user.id,
        approverDisplayName: parsed.data.approverDisplayName,
        approverRole: parsed.data.approverRole ?? null,
        approvedAt: new Date(),
        nextReviewDate: parsed.data.nextReviewDate,
        vaultPointer: parsed.data.vaultPointer ?? null,
        acceptanceRecordHash: parsed.data.acceptanceRecordHash ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await writeAuditLog({
    organizationId: orgId,
    userId: user.id,
    action: "risk_assessment.acceptance_recorded",
    resourceType: "risk_acceptance",
    resourceId: created.id,
    details: {
      riskAssessmentId: assessment.id,
      assessmentPivotId: assessment.assessmentPivotId,
      riskExternalId: created.riskExternalId,
      severity: created.severity,
      residualRisk: created.residualRisk,
      approverDisplayName: created.approverDisplayName,
      controlId: "3.11.1",
    },
  });

  revalidatePath(`/dashboard/controls/3.11.1`);

  return NextResponse.json({ ok: true, acceptance: created });
}
