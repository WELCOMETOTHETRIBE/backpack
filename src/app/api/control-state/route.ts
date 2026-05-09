/**
 * GET /api/control-state
 *
 * Canonical control state for every control in the caller's org —
 * the single source of truth that every UI surface should read.
 *
 * Returns the full ControlState shape per control: aggregateFinding
 * (MET / NOT MET / NA), per-objective verdicts, met_via + elevator
 * pointers, internal CAE rollup, derived bin-1-5 status, sub-label,
 * override visibility, computed timestamp.
 *
 * Replaces the older /api/control-records/adjudicated-ids for any
 * surface that needs richer state than "is this adjudicated y/n."
 * The legacy endpoint stays for back-compat during the Phase A1
 * migration.
 *
 * Auth: Admin / Compliance / Assessor.
 */
import { NextResponse } from "next/server";

import { requireOrg, requireRole } from "@/lib/auth";
import { getControlStatesForOrg } from "@/lib/canonical-state/get-control-state";

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

  const states = await getControlStatesForOrg(orgId);

  // Tally so the SCTM page can render its summary card without
  // re-walking the array.
  let met = 0;
  let notMet = 0;
  let na = 0;
  for (const s of states.values()) {
    if (s.aggregateFinding === "MET") met++;
    else if (s.aggregateFinding === "NOT_MET") notMet++;
    else if (s.aggregateFinding === "NA") na++;
  }

  return NextResponse.json({
    states: Object.fromEntries(states),
    summary: {
      controlsWithSnapshot: states.size,
      met,
      notMet,
      na,
      defensible: met + na,
    },
  });
}
