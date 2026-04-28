import { NextResponse, type NextRequest } from "next/server"

import { authorizeIrRequest, bridgeErrorResponse } from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/whoami
 *
 * Returns the auth-resolved internal user_id + organization_id for the calling
 * bridge request. Used by training-side AAR approval to discover the caller's
 * control-plane users.id (needed because training and control-plane have
 * separate user tables — the bridge resolves via X-IR-Bridge-User-Email).
 *
 * Returns: { userId: string | null, organizationId: string, mode: "service" | "session" }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeIrRequest(req, "")
    return NextResponse.json({
      userId: auth.userId,
      organizationId: auth.organizationId,
      mode: auth.mode,
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
