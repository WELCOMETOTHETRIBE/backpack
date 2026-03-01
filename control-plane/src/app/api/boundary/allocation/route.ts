import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, boundarySnapshots } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/boundary/allocation
 * Returns latest snapshot's allocations (control_id, status, layer, rationale) for control lookup.
 */
export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [latestSnapshot] = await db
      .select({
        snapshotJson: boundarySnapshots.snapshotJson,
        createdAt: boundarySnapshots.createdAt,
      })
      .from(boundarySnapshots)
      .where(eq(boundarySnapshots.accountId, accountId))
      .orderBy(desc(boundarySnapshots.createdAt))
      .limit(1);

    if (!latestSnapshot?.snapshotJson) {
      return NextResponse.json({
        allocations: [],
        created_at: null,
        allocation_hash: null,
      });
    }

    const snapshot = latestSnapshot.snapshotJson as {
      allocations?: Array<{
        control_id: string;
        status: string;
        layer: string;
        rationale?: { rule?: string; contributing_services?: string[] };
      }>;
      allocation_hash?: string;
    };

    return NextResponse.json({
      allocations: snapshot.allocations ?? [],
      created_at: latestSnapshot.createdAt,
      allocation_hash: snapshot.allocation_hash ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get allocation";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
