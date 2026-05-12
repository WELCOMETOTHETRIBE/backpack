import { NextResponse } from "next/server";
import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

/**
 * GET /api/cron/training-expiry-rescore
 *
 * Catches the date-based AT-family transitions no application write
 * would trigger. Training records have an expires_at date (annual
 * cadence by default); when that date crosses "today," the canonical
 * adjudication for 3.2.1 / 3.2.2 / 3.2.3 should reflect the user
 * having lapsed coverage — but no UPDATE fires on calendar rollover,
 * so the SCTM family card would silently stay MET.
 *
 * Strategy: brute-force daily rescore of the AT family for every org
 * that has at least one training record. Per-control scoring is cheap
 * and the alternative (track which expires_at thresholds crossed in
 * the last 24h) is more code for no real-world win — annual training
 * is the granularity here, no one cares if it takes 24h to flip.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET} — same posture as
 * /api/cron/conmon-summary. CRON_SECRET must be set on Railway; if
 * absent, requests are rejected (no anonymous bypass).
 *
 * Recommended cadence: once daily, early UTC (e.g. `0 7 * * *`).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find every org that has any training record. Orgs with zero training
  // records have nothing for the AT scorer to evaluate (and they'd just
  // resolve to NOT_MET anyway, which the next user-driven rescore will
  // catch).
  const orgRows = await db
    .selectDistinct({ organizationId: trainingRecords.organizationId })
    .from(trainingRecords);

  const AT_CONTROL_IDS = ["3.2.1", "3.2.2", "3.2.3"];
  const results: Array<{
    orgId: string;
    rescored: number;
    metFlipsToNotMet: number;
    notMetFlipsToMet: number;
    errored: number;
    error?: string;
  }> = [];

  for (const { organizationId } of orgRows) {
    try {
      const r = await scoreControlsAffectedBy({
        organizationId,
        triggerSource: "phase_b_full_rescore",
        controlIds: AT_CONTROL_IDS,
        triggeredByUserId: null,
      });
      results.push({
        orgId: organizationId,
        rescored: r.rescored,
        metFlipsToNotMet: r.metFlipsToNotMet,
        notMetFlipsToMet: r.notMetFlipsToMet,
        errored: r.errored,
      });
    } catch (err) {
      results.push({
        orgId: organizationId,
        rescored: 0,
        metFlipsToNotMet: 0,
        notMetFlipsToMet: 0,
        errored: 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      orgs: acc.orgs + 1,
      rescored: acc.rescored + r.rescored,
      metFlipsToNotMet: acc.metFlipsToNotMet + r.metFlipsToNotMet,
      notMetFlipsToMet: acc.notMetFlipsToMet + r.notMetFlipsToMet,
      errored: acc.errored + r.errored,
    }),
    { orgs: 0, rescored: 0, metFlipsToNotMet: 0, notMetFlipsToMet: 0, errored: 0 },
  );

  return NextResponse.json({ totals, results });
}
