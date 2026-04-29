import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { controlFamilies, controls } from "@/db/schema"
import { authorizeIrRequest, bridgeErrorResponse } from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/control-library
 *
 * Returns the seeded NIST 800-171 / CMMC L2 control library, joined with
 * family info. Used by the Control Mapping Matrix XLSX generator (training
 * side) so titles and discussion guidance are pulled from the live source of
 * truth instead of the hard-coded subset that shipped pre-Phase 8.
 *
 * Tenant-agnostic — the control library is global. Auth is still required
 * (any bridge-authenticated caller).
 */
export async function GET(req: NextRequest) {
  try {
    await authorizeIrRequest(req, "")

    const rows = await db
      .select({
        controlId: controls.controlId,
        nistReqId: controls.nistReqId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        nistDiscussionGuidance: controls.nistDiscussionGuidance,
        familyCode: controlFamilies.code,
        familyName: controlFamilies.name,
      })
      .from(controls)
      .innerJoin(
        controlFamilies,
        eq(controls.controlFamilyId, controlFamilies.id)
      )

    return NextResponse.json({
      schemaVersion: "ir-tabletop-control-library.v1",
      count: rows.length,
      controls: rows,
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
