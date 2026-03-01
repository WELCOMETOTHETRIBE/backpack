/**
 * GET /api/boundary/snapshot/verify-latest
 * Verifies coverage for the latest snapshot (no snapshot_id).
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { verifySnapshotCoverage } from "@/lib/evidence/verifySnapshotCoverage";

export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [boundaryRow] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundaryRow?.boundaryId) {
      return NextResponse.json({ ok: false, error: "no_boundary" }, { status: 400 });
    }

    const result = await verifySnapshotCoverage({
      db,
      organizationId: accountId,
      accountId,
      boundaryId: boundaryRow.boundaryId,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to verify coverage";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
