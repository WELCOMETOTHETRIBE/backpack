/**
 * POST /api/ssp/baselines/:baselineId/detect-drift
 *
 * Manual "Run Drift Check" trigger. Loads the baseline, runs every
 * detector (evidence / control finding / boundary component / POA&M),
 * and upserts ssp_baseline_drift_events rows. Idempotent: re-running
 * refreshes existing OPEN events rather than duplicating them.
 *
 * Auth: Admin or Compliance role; org-scoped — the baseline must
 * belong to the caller's organization or detection refuses.
 *
 * Returns the post-detection counts the dashboard shows in the
 * "drift center" header card.
 */
import { NextResponse, type NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import { detectDriftAgainstBaseline } from "@/lib/ssp/baseline-drift";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ baselineId: string }> },
) {
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

  const { baselineId } = await params;
  if (!baselineId) {
    return NextResponse.json(
      { error: "baselineId path param is required" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await detectDriftAgainstBaseline({
      organizationId: orgId,
      baselineId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "drift detection failed";
    // "not found" is a 404; everything else is 500. The service
    // throws a Error with "not found" in the message when the
    // baseline doesn't belong to the caller's org.
    if (msg.includes("not found")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[detect-drift] unexpected failure:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Best-effort audit log; failure shouldn't 500 the response.
  try {
    await writeAuditLog({
      organizationId: orgId,
      userId: user.id ?? null,
      action: "ssp.baseline_drift.detected",
      resourceType: "ssp_release_baseline",
      resourceId: baselineId,
      details: {
        open_event_count: result.openEventCount,
        new_event_count: result.newEventCount,
        refreshed_event_count: result.refreshedEventCount,
        by_severity: result.bySeverity,
      },
    });
  } catch (err) {
    console.error("[detect-drift] audit log write failed:", err);
  }

  return NextResponse.json(result, { status: 200 });
}
