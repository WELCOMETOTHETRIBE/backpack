import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { governanceRegisterEntries, governanceRegisters } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/risk-assessment/list
 *
 * Phase 3 — returns past completed risk assessments for this org. Each
 * row is a unique assessment_id with summary stats so the Phase 0 page
 * can render a "Past assessments" table with download links pointing at
 * /api/risk-assessment/bundle/:assessmentId.
 *
 * Phase 1 stamps `assessment_id`, `preparer`, `approver`, `sign_off_date`,
 * `review_period_*` on every register entry it creates. This endpoint
 * groups by assessment_id and returns one row per assessment.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssessmentSummary = {
  assessmentId: string;
  riskCount: number;
  reviewPeriodStart: string | null;
  reviewPeriodEnd: string | null;
  preparer: string | null;
  approver: string | null;
  signOffDate: string | null;
  earliestEntryAt: string | null;
};

export async function GET() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        sql`${governanceRegisterEntries.entryData} ? 'assessment_id'`,
      ),
    );

  const byId = new Map<string, AssessmentSummary>();
  for (const row of rows) {
    const d = row.entryData as Record<string, unknown>;
    const id = String(d.assessment_id ?? "");
    if (!id) continue;
    const finalizedAt = row.finalizedAt instanceof Date ? row.finalizedAt.toISOString() : (row.finalizedAt ? String(row.finalizedAt) : null);
    const existing = byId.get(id);
    if (existing) {
      existing.riskCount++;
      if (finalizedAt && (!existing.earliestEntryAt || finalizedAt < existing.earliestEntryAt)) {
        existing.earliestEntryAt = finalizedAt;
      }
    } else {
      byId.set(id, {
        assessmentId: id,
        riskCount: 1,
        reviewPeriodStart: d.review_period_start ? String(d.review_period_start) : null,
        reviewPeriodEnd: d.review_period_end ? String(d.review_period_end) : null,
        preparer: d.preparer ? String(d.preparer) : null,
        approver: d.approver ? String(d.approver) : null,
        signOffDate: d.sign_off_date ? String(d.sign_off_date) : null,
        earliestEntryAt: finalizedAt,
      });
    }
  }

  const assessments = Array.from(byId.values()).sort((a, b) => {
    const aDate = a.signOffDate ?? a.earliestEntryAt ?? "";
    const bDate = b.signOffDate ?? b.earliestEntryAt ?? "";
    return bDate.localeCompare(aDate);
  });

  return NextResponse.json({ assessments });
}
