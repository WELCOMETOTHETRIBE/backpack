import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import {
  computeAdjudicationContext,
  isControlAdjudicated,
  type ControlRecordRow,
} from "@/lib/adjudication-helpers";

/**
 * GET /api/control-records/adjudicated-ids
 *
 * Returns the set of control IDs that are canonically adjudicated for the
 * caller's org, computed via the C3PAO-rigorous helper in
 * adjudication-helpers.ts. This is the single source of truth -- the
 * dashboard Overview reads it directly, and the SCTM page now does too,
 * which closes the split-count problem where two surfaces ran two
 * different versions of the same check and reported different totals.
 *
 * Response shape:
 *   {
 *     adjudicatedControlIds: string[],   // NIST short ids, e.g. "3.1.1"
 *     total: number                      // matches Overview's count
 *   }
 *
 * Adjudication is rigorous:
 *   - inherited / not_applicable: status taken at face value
 *   - implemented / assessed: requires operational evidence in at least one
 *     of (technical, register, artifact, attestation) lanes
 *   - dual-pipeline controls (Bin 5): also requires cloud-side PASS
 *   - hybrid (policyDocRequired) controls: requires both technical and
 *     policy lanes literally "satisfied" + operational evidence
 */
export async function GET() {
  let orgId: string;
  try {
    orgId = await requireOrg();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const records = (await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId))) as ControlRecordRow[];

  const ctx = await computeAdjudicationContext(
    orgId,
    records.map((r) => r.id),
  );

  const adjudicatedControlIds = records
    .filter((r) => isControlAdjudicated(r, ctx))
    .map((r) => r.controlId);

  return NextResponse.json({
    adjudicatedControlIds,
    total: adjudicatedControlIds.length,
  });
}
