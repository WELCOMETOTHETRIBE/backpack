import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
  organizations,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { computeOrgPosture } from "@/lib/risk-assessment/posture-engine";
import {
  buildAssessmentBundle,
  inherentRiskLevel,
  type RiskRecord,
  type AssessmentMeta,
} from "@/lib/risk-assessment/bundle-builder";
import { scenarioById } from "@/lib/risk-assessment/threat-scenarios";

/**
 * GET /api/risk-assessment/bundle/:assessmentId
 *
 * Phase 3 — returns a ZIP evidence bundle for a single completed risk
 * assessment. The bundle bundles the risk register entries from this
 * assessment with a PDF cover sheet, CSV/JSON exports, and a posture
 * snapshot — everything a C3PAO assessor needs to review the assessment
 * offline.
 *
 * Tenant isolation: only entries whose registerId belongs to the caller's
 * org are included. If no entries match the assessmentId for this org,
 * 404.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const { assessmentId } = await params;
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!assessmentId || assessmentId.length < 8) {
    return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  }

  // ── Pull all entries for this assessment, scoped to caller's org ──
  const rows = await db
    .select({
      entryData: governanceRegisterEntries.entryData,
      finalizedAt: governanceRegisterEntries.finalizedAt,
    })
    .from(governanceRegisterEntries)
    .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisterEntries.entryData} ->> 'assessment_id' = ${assessmentId}`,
      ),
    );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // ── Org name (for the cover sheet) ──
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // ── Reconstruct meta from any entry (Phase 1 stamps it on every row) ──
  const first = rows[0].entryData as Record<string, unknown>;
  const meta: AssessmentMeta = {
    assessmentId,
    organizationName: org?.name ?? "Organization",
    boundaryName: "—", // filled in below from posture (it has the canonical name)
    reviewPeriodStart: String(first.review_period_start ?? ""),
    reviewPeriodEnd: String(first.review_period_end ?? ""),
    scopeStatement: String(first.scope_statement ?? ""),
    methodology: String(first.methodology ?? "NIST SP 800-30 Rev 1"),
    assessor: String(first.identified_by ?? ""),
    preparer: String(first.preparer ?? ""),
    reviewer: first.reviewer ? String(first.reviewer) : null,
    approver: String(first.approver ?? ""),
    signOffDate: String(first.sign_off_date ?? ""),
  };

  // ── Posture snapshot (current state at bundle generation) ──
  const posture = await computeOrgPosture(orgId);
  meta.boundaryName = posture.boundaryName;

  // ── Map each register entry into the bundle's RiskRecord shape ──
  const risks: RiskRecord[] = rows.map((row) => {
    const d = row.entryData as Record<string, unknown>;
    const scenarioId = String(d.scenario_id ?? "");
    const scenario = scenarioById(scenarioId);
    const likelihood = String(d.likelihood ?? "possible");
    const impact = String(d.impact ?? "moderate");
    return {
      riskId: String(d.risk_id ?? ""),
      scenarioId,
      riskStatement: String(d.risk_statement ?? ""),
      threatSource: scenario?.threatSource ?? "",
      vulnerability: scenario?.vulnerability ?? "",
      potentialImpact: scenario?.potentialImpact ?? "",
      likelihood,
      impact,
      inherentRisk: inherentRiskLevel(likelihood, impact),
      treatmentStrategy: String(d.treatment_strategy ?? "mitigate"),
      owner: String(d.owner ?? ""),
      targetDate: d.target_date ? String(d.target_date) : null,
      existingControls: Array.isArray(d.existing_controls)
        ? (d.existing_controls as unknown[]).map(String)
        : [],
      applicableControls: scenario?.applicableControls ?? [],
      notes: d.notes ? String(d.notes) : null,
      identifiedAt: String(d.identified_at ?? row.finalizedAt?.toISOString() ?? ""),
      identifiedBy: String(d.identified_by ?? ""),
    };
  });

  const { buffer, filename, fingerprint } = await buildAssessmentBundle({ meta, risks, posture });

  console.log(
    JSON.stringify({
      event: "risk_assessment_bundle_generated",
      orgId,
      assessmentId,
      riskCount: risks.length,
      fingerprint,
      bytes: buffer.length,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-Bundle-Fingerprint": fingerprint,
    },
  });
}
