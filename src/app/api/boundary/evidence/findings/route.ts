import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, evidenceRuns, evidenceFindings } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { computeFreshnessStatus } from "@/lib/evidence/freshnessPolicy";

/**
 * GET /api/boundary/evidence/findings?control_id=SC.L2-3.13.11
 * Returns latest finding(s) for the given control for the account's boundary.
 */
export async function GET(req: Request) {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const controlId = searchParams.get("control_id")?.trim();

    const [boundary] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundary?.boundaryId) {
      return NextResponse.json({ findings: [] });
    }

    if (!controlId) {
      return NextResponse.json({ error: "control_id query required" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: evidenceFindings.evidenceRunId,
        controlId: evidenceFindings.controlId,
        pass: evidenceFindings.pass,
        observed: evidenceFindings.observed,
        expected: evidenceFindings.expected,
        evidenceHint: evidenceFindings.evidenceHint,
        evidenceFilesUsed: evidenceFindings.evidenceFilesUsed,
        providerOrCustomer: evidenceFindings.providerOrCustomer,
        layer: evidenceFindings.layer,
        details: evidenceFindings.details,
        collectedAt: evidenceRuns.collectedAt,
        source: evidenceRuns.source,
        runId: evidenceRuns.runId,
      })
      .from(evidenceFindings)
      .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
      .where(
        and(
          eq(evidenceRuns.boundaryId, boundary.boundaryId),
          eq(evidenceFindings.controlId, controlId)
        )
      )
      .orderBy(desc(evidenceRuns.collectedAt))
      .limit(20);

    const findings = rows.map((r) => {
      const collectedAtIso =
        r.collectedAt instanceof Date ? r.collectedAt.toISOString() : String(r.collectedAt);
      const freshness = computeFreshnessStatus(collectedAtIso, r.layer);
      return {
        control_id: r.controlId,
        pass: r.pass,
        observed: r.observed,
        expected: r.expected,
        evidence_hint: r.evidenceHint,
        evidence_files_used: r.evidenceFilesUsed ?? [],
        provider_or_customer: r.providerOrCustomer,
        layer: r.layer,
        details: r.details ?? undefined,
        collected_at: r.collectedAt,
        source: r.source,
        run_id: r.runId,
        freshness_status: freshness.status,
        freshness_days: freshness.freshness_days,
        freshness_cutoff_utc: freshness.freshness_cutoff_utc,
      };
    });

    return NextResponse.json({ findings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get findings";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
