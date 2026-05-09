/**
 * POST /api/cae/rescore
 *
 * Admin-only manual full-rescore trigger. Calls the canonical
 * `scoreControlsAffectedBy` for every control in the org. Used to
 * backfill `aggregate_finding` / `met_via` on snapshots that predate
 * migration 0068, or to refresh after a bulk evidence import.
 *
 * Best-effort: per-control failures are caught and counted by the
 * canonical helper; this endpoint just surfaces the tally.
 *
 * Auth: Admin only — full rescore changes 110 rows in one shot, which
 * is exactly the kind of write that should be gated to the role with
 * "speak as the system" authority.
 */
import { NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin"]);

    const result = await scoreControlsAffectedBy({
      organizationId: orgId,
      triggerSource: "phase_b_full_rescore",
      triggeredByUserId: user.id,
    });

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "cae.full_rescore",
      resourceType: "organization",
      resourceId: orgId,
      details: {
        rescored: result.rescored,
        met_flips_to_not_met: result.metFlipsToNotMet,
        not_met_flips_to_met: result.notMetFlipsToMet,
        draft_poams_created: result.draftPoamsCreated,
        poam_elevators_revoked: result.poamElevatorsRevoked,
        errored: result.errored,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST /api/cae/rescore]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "rescore failed" },
      { status: 500 },
    );
  }
}
