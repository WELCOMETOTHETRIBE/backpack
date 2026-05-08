/**
 * GET /api/readiness/ra-3-11-1
 *
 * Single-card readiness payload for the RA.L2-3.11.1 dashboard tile.
 * Reads the most recent finalized risk_assessments row (or, if none,
 * the most recent draft) and computes:
 *
 *   - lifecycle status (current, with stale fallback)
 *   - objective [a] / [b] verdict
 *   - cadence health: healthy | due_soon | overdue | blocked | incomplete
 *   - risk severity & treatment counts (derived from risk_register entries)
 *   - POA&M required / created / linked / overdue
 *   - accepted high/critical risk count
 *   - unresolved high/critical risk count
 *   - readiness score (0–100)
 *
 * Auth: Compliance / Admin / Assessor (read-only payload).
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  riskAssessments,
  riskAcceptances,
  riskPoamLinks,
  governanceRegisterEntries,
  governanceRegisters,
  poamEntries,
} from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  evaluateObjectiveA,
  evaluateObjectiveB,
} from "@/lib/risk-assessment/lifecycle";

const ONE_DAY_MS = 86_400_000;

export async function GET() {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }

  // Most recent finalized; if none, fall back to most recent draft.
  const finalized = await db
    .select()
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
      ),
    )
    .orderBy(desc(riskAssessments.finalizedAt))
    .limit(1);

  const fallback = finalized[0]
    ? null
    : (
        await db
          .select()
          .from(riskAssessments)
          .where(eq(riskAssessments.organizationId, orgId))
          .orderBy(desc(riskAssessments.createdAt))
          .limit(1)
      )[0] ?? null;

  const row = finalized[0] ?? fallback;

  if (!row) {
    return NextResponse.json({
      controlId: "3.11.1",
      status: "incomplete",
      reason:
        "No risk assessment on file. Run the wizard in MacTech Training; the bridge populates this card once you finalize.",
      readinessScore: 0,
    });
  }

  // Counts pinned to this row's pivot.
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE gre.status = 'final')::int AS total,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND lower(gre.entry_data ->> 'impact') = 'low')::int AS low,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND lower(gre.entry_data ->> 'impact') IN ('moderate','medium'))::int AS moderate,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND lower(gre.entry_data ->> 'impact') = 'high')::int AS high,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND lower(gre.entry_data ->> 'impact') = 'critical')::int AS critical,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND gre.entry_data ->> 'treatment_strategy' = 'mitigate')::int AS mit,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND gre.entry_data ->> 'treatment_strategy' = 'accept')::int AS acc,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND gre.entry_data ->> 'treatment_strategy' = 'transfer')::int AS xfr,
      COUNT(*) FILTER (WHERE gre.status = 'final' AND gre.entry_data ->> 'treatment_strategy' = 'avoid')::int AS avd
    FROM ${governanceRegisterEntries} gre
    JOIN ${governanceRegisters} gr ON gr.id = gre.register_id
    WHERE gr.organization_id = ${orgId}
      AND gr.register_key = 'risk_register'
      AND gre.entry_data ->> 'assessment_id' = ${row.assessmentPivotId}
  `);
  const c = (counts as unknown as { rows: Record<string, number>[] }).rows[0] ?? {
    total: 0, low: 0, moderate: 0, high: 0, critical: 0,
    mit: 0, acc: 0, xfr: 0, avd: 0,
  };

  // Acceptances + POA&M links for this assessment.
  const [acceptedTotals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      hiCrit: sql<number>`count(*) filter (where ${riskAcceptances.severity} in ('high','critical'))::int`,
    })
    .from(riskAcceptances)
    .where(eq(riskAcceptances.riskAssessmentId, row.id));

  const [poamLinkTotals] = await db
    .select({
      linked: sql<number>`count(*)::int`,
      created: sql<number>`count(*) filter (where ${riskPoamLinks.poamEntryId} is not null)::int`,
    })
    .from(riskPoamLinks)
    .where(eq(riskPoamLinks.riskAssessmentId, row.id));

  // Overdue POA&Ms among the linked ones.
  const [overdueLinkedPoams] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(riskPoamLinks)
    .leftJoin(poamEntries, eq(riskPoamLinks.poamEntryId, poamEntries.id))
    .where(
      and(
        eq(riskPoamLinks.riskAssessmentId, row.id),
        sql`${poamEntries.status} = 'open' AND ${poamEntries.scheduledCompletionDate} < CURRENT_DATE`,
      ),
    );

  const unresolvedHC = await db.execute(sql`
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
  const unresolvedHCCount =
    Number(
      (unresolvedHC as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0,
    );

  const objA = evaluateObjectiveA(row);
  const objB = await evaluateObjectiveB(row);

  // Cadence verdict.
  let cadence: "healthy" | "due_soon" | "overdue" | "blocked" | "incomplete";
  let daysUntilDue: number | null = null;
  if (unresolvedHCCount > 0) {
    cadence = "blocked";
  } else if (objA.status !== "met" || objB.status !== "met") {
    cadence = "incomplete";
  } else if (row.nextDueDate) {
    daysUntilDue = Math.ceil(
      (new Date(row.nextDueDate).getTime() - Date.now()) / ONE_DAY_MS,
    );
    cadence = daysUntilDue < 0 ? "overdue" : daysUntilDue <= 60 ? "due_soon" : "healthy";
  } else {
    cadence = "incomplete";
  }

  // Readiness score per the spec's 5-bucket schema.
  let readinessScore: 0 | 25 | 50 | 75 | 100;
  if (cadence === "overdue" || (objA.status !== "met" && row.status === "draft")) {
    readinessScore = 0;
  } else if (objA.status === "met" && row.status === "draft" && c.total === 0) {
    readinessScore = 25;
  } else if (row.status === "draft" || row.status === "in_progress") {
    readinessScore = 50;
  } else if (row.status === "approved" || row.status === "ready_for_approval" || row.status === "reviewed") {
    readinessScore = 75;
  } else if (row.status === "finalized" && unresolvedHCCount === 0) {
    readinessScore = 100;
  } else {
    readinessScore = 50;
  }

  return NextResponse.json({
    controlId: "3.11.1",
    assessmentId: row.id,
    assessmentPivotId: row.assessmentPivotId,
    boundaryId: row.boundaryId,
    status: row.status,
    cadence,
    daysUntilDue,
    nextDueDate: row.nextDueDate,
    definedFrequencyDays: row.definedFrequencyDays,
    objective: {
      a: { status: objA.status, rationale: objA.rationale },
      b: { status: objB.status, rationale: objB.rationale, risksCount: objB.risksCount },
    },
    riskCounts: {
      total: c.total,
      low: c.low,
      moderate: c.moderate,
      high: c.high,
      critical: c.critical,
    },
    treatmentCounts: {
      mitigate: c.mit,
      accept: c.acc,
      transfer: c.xfr,
      avoid: c.avd,
    },
    poam: {
      linked: poamLinkTotals?.linked ?? 0,
      created: poamLinkTotals?.created ?? 0,
      overdue: overdueLinkedPoams?.n ?? 0,
    },
    accepted: {
      total: acceptedTotals?.total ?? 0,
      highCritical: acceptedTotals?.hiCrit ?? 0,
    },
    unresolvedHighCriticalWithoutTreatment: unresolvedHCCount,
    finalReportSha256: row.finalReportSha256,
    packageSha256: row.packageSha256,
    vaultArtifactPointer: row.vaultArtifactPointer,
    readinessScore,
    finalizedAt: row.finalizedAt,
    submittedAt: row.submittedAt,
    approverDisplayName: row.approverDisplayName,
  });
}
