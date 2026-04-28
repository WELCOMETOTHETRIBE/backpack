import { NextResponse, type NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { irScenarios } from "@/db/schema";
import { authorizeIrRequest, bridgeErrorResponse } from "@/lib/ir-tabletop-bridge";

/**
 * GET /api/ir-tabletop/scenarios
 *
 * Returns the active IR Tabletop scenario catalog (read-only).
 * Auth: service-mode (HMAC bridge) or session-mode (Clerk).
 *
 * Note: ir_scenarios is empty until the seed script runs (Phase 2 deliverable).
 */
export async function GET(req: NextRequest) {
  try {
    await authorizeIrRequest(req, "");
    const rows = await db
      .select()
      .from(irScenarios)
      .where(eq(irScenarios.isActive, true))
      .orderBy(desc(irScenarios.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
