/**
 * POST /api/risk-assessments/[id]/risks
 *
 * Bulk upsert of risks identified during the TrainOS-hosted wizard.
 * Each risk maps to one row in governance_register_entries with:
 *   - registerKey='risk_register' (resolved on the org)
 *   - entryType='risk_identified'
 *   - entryData.assessment_id = the parent envelope's assessmentPivotId
 *   - entryData.risk_id = the wizard-supplied riskExternalId
 *   - status = 'final' (the wizard publishes finalized rows; in-progress
 *     drafts live in TrainOS and don't cross the boundary until the
 *     customer publishes)
 *
 * Idempotent on (assessment_pivot_id, risk_external_id). Re-posting the
 * same risk updates entryData in place. To delete a risk, TrainOS
 * sends a request without the risk in the array AND a separate
 * deletion endpoint — out of scope for v1.
 *
 * Refused if the parent envelope is finalized or superseded.
 *
 * Auth: bridge or session.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
  riskAssessments,
} from "@/db/schema";
import {
  authorizeRiskRequest,
  bridgeErrorResponse,
  BRIDGE_CONTRACT_VERSION,
  logRaAuditEvent,
  RisksUpsertSchema,
} from "@/lib/risk-assessment-bridge";
import { TERMINAL_STATUSES } from "@/lib/risk-assessment/lifecycle";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // TEMPORARY debug wrapper — surfaces unhandled exceptions as JSON
  // so opaque 500s during the TrainOS smoke test become diagnosable.
  // Remove once the route is stable.
  try {
    return await handlePost(req, { params });
  } catch (err) {
    const detail =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack?.split("\n").slice(0, 12),
          }
        : { raw: String(err) };
    // eslint-disable-next-line no-console
    console.error("[risks route] uncaught error", detail);
    return NextResponse.json(
      { error: "risks_route_uncaught", detail },
      { status: 500 },
    );
  }
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawBody = await req.text();
  let auth: Awaited<ReturnType<typeof authorizeRiskRequest>>;
  let parsed: ReturnType<typeof RisksUpsertSchema.safeParse>;
  try {
    auth = await authorizeRiskRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = RisksUpsertSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
  const orgId = auth.organizationId;

  // Parent envelope must exist + belong to org + be mutable.
  const [envelope] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(eq(riskAssessments.id, id), eq(riskAssessments.organizationId, orgId)),
    )
    .limit(1);
  if (!envelope) {
    return NextResponse.json(
      { error: "Not found", contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: 404 },
    );
  }
  if (TERMINAL_STATUSES.includes(envelope.status as "finalized" | "superseded")) {
    return NextResponse.json(
      {
        error: `Assessment is ${envelope.status}; cannot mutate.`,
        contractVersion: BRIDGE_CONTRACT_VERSION,
      },
      { status: 409 },
    );
  }

  // Resolve the org's risk_register. There's exactly one per org per
  // boundary (the wizard creates it lazily on first run); if missing,
  // we 422 — TrainOS shouldn't be calling /risks without having
  // bootstrapped the register.
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisters.registerKey, "risk_register"),
      ),
    )
    .limit(1);
  if (!register) {
    return NextResponse.json(
      {
        error:
          "No risk_register exists for this organization. Bootstrap the register before posting risks.",
        contractVersion: BRIDGE_CONTRACT_VERSION,
      },
      { status: 422 },
    );
  }

  // Upsert each risk. We can't use Drizzle's onConflictDoUpdate here
  // because the dedupe key lives inside entryData (a JSONB column),
  // not on a unique-index column — so the loop is explicit.
  const now = new Date();
  let inserted = 0;
  let updated = 0;
  for (const r of parsed.data.risks) {
    // postgres-js returns rows DIRECTLY as an array — not wrapped in
    // a { rows } object like node-postgres does. Indexing [0] on the
    // result IS the row, not `result.rows[0]`. Wrong shape here was
    // throwing "Cannot read properties of undefined (reading '0')"
    // and crashing the route with an opaque 500 during the TrainOS
    // smoke test.
    const existingRows = (await db.execute(sql`
      SELECT id
      FROM ${governanceRegisterEntries}
      WHERE register_id = ${register.id}
        AND boundary_id = ${envelope.boundaryId}
        AND entry_data ->> 'assessment_id' = ${envelope.assessmentPivotId}
        AND entry_data ->> 'risk_id' = ${r.riskExternalId}
      LIMIT 1
    `)) as unknown as Array<{ id: string }>;
    const existingId = existingRows[0]?.id;

    // risk_rating mirrors severity in the form the
    // register_field_labels_and_summaries.v1.json template expects
    // ("Risk {{risk_id}} identified by {{identified_by}} ({{risk_rating}})…").
    // Without it the rendered summary line on /dashboard/evidence-engine/
    // registers/risk_register reads "()" with nothing inside.
    const riskRating =
      r.riskRating ??
      (r.severity ? r.severity : null);

    const entryData = {
      risk_id: r.riskExternalId,
      identified_at: now.toISOString(),
      identified_by: envelope.assessorDisplayName ?? "trainos",
      risk_statement: r.riskStatement,
      likelihood: r.likelihood,
      impact: r.impact,
      owner: r.owner,
      affected_systems: [envelope.boundaryId],
      notes: r.notes ?? null,
      threat_source: r.threatSource ?? null,
      vulnerability: r.vulnerability ?? null,
      // Pivot fields
      assessment_id: envelope.assessmentPivotId,
      scenario_id: r.scenarioId,
      methodology: envelope.methodology,
      review_period_start: envelope.reviewPeriodStart,
      review_period_end: envelope.reviewPeriodEnd,
      treatment_strategy: r.treatment,
      target_date: r.targetDate ?? null,
      existing_controls: r.existingControls,
      preparer: envelope.assessorDisplayName,
      reviewer: envelope.reviewerDisplayName,
      approver: envelope.approverDisplayName,

      // ── Defensibility / enrichment (v1.1, additive) ─────────────
      // All optional. When present, surfaces inline on Codex without
      // requiring the C3PAO to crack the vault zip.
      risk_rating: riskRating,
      severity: r.severity ?? null,
      inherent_likelihood: r.inherentLikelihood ?? null,
      inherent_impact: r.inherentImpact ?? null,
      inherent_risk: r.inherentRisk ?? null,
      residual_likelihood: r.residualLikelihood ?? null,
      residual_impact: r.residualImpact ?? null,
      residual_risk: r.residualRisk ?? null,
      control_effectiveness: r.controlEffectiveness ?? null,
      treatment_rationale: r.treatmentRationale ?? null,
      acceptance_rationale: r.acceptanceRationale ?? null,
      acceptance_review_date: r.acceptanceReviewDate ?? null,
      acceptance_approver_display_name:
        r.acceptanceApproverDisplayName ?? null,
      transfer_mechanism: r.transferMechanism ?? null,
      avoidance_description: r.avoidanceDescription ?? null,
      impact_operations: r.impactOperations ?? null,
      impact_mission: r.impactMission ?? null,
      impact_image_reputation: r.impactImageReputation ?? null,
      impact_assets: r.impactAssets ?? null,
      impact_individuals: r.impactIndividuals ?? null,
      relevant_cmmc_controls: r.relevantCmmcControls ?? null,
      library_scenario_key: r.libraryScenarioKey ?? null,
    };

    if (existingId) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existingId));
      updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: register.id,
        boundaryId: envelope.boundaryId,
        entryData,
        entryType: "risk_identified",
        status: "final",
        finalizedAt: now,
        createdById: auth.userId,
      });
      inserted++;
    }
  }

  await logRaAuditEvent({
    organizationId: orgId,
    userId: auth.userId,
    action: "risk_assessment.risks_upserted",
    resourceType: "risk_assessment",
    resourceId: envelope.id,
    details: {
      assessmentPivotId: envelope.assessmentPivotId,
      inserted,
      updated,
      total: parsed.data.risks.length,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
      controlId: "3.11.1",
    },
    req,
  });

  revalidatePath("/dashboard/controls/3.11.1");
  revalidatePath("/dashboard/readiness/risk-assessment");

  return NextResponse.json({
    ok: true,
    contractVersion: BRIDGE_CONTRACT_VERSION,
    inserted,
    updated,
  });
}
