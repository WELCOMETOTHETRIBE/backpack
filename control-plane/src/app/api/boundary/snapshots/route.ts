import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundarySnapshots } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/boundary/snapshots
 * Returns list of snapshots for the account (most recent first), summary only.
 */
export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const rows = await db
      .select()
      .from(boundarySnapshots)
      .where(eq(boundarySnapshots.accountId, accountId))
      .orderBy(desc(boundarySnapshots.createdAt));

    const list = rows.map((row) => {
      const snap = row.snapshotJson as {
        counts?: { inherited?: number; shared?: number; customer?: number; notApplicable?: number };
        sensitivity_warnings?: unknown[];
        secondary_layer_warnings?: unknown[];
        configured_but_not_creditable_risks?: unknown[];
      };
      const sensitivity_warnings = snap.sensitivity_warnings ?? [];
      const secondary_layer_warnings = snap.secondary_layer_warnings ?? [];
      const configured_but_not_creditable_risks = snap.configured_but_not_creditable_risks ?? [];
      return {
        snapshot_id: row.snapshotId,
        created_at: row.createdAt,
        allocation_hash: row.allocationHash,
        registry_version: row.registryVersion,
        counts: snap.counts ?? null,
        warnings_summary: {
          sensitivity_warning_count: sensitivity_warnings.length,
          secondary_layer_warning_count: secondary_layer_warnings.length,
          configured_but_not_creditable_risk_count: configured_but_not_creditable_risks.length,
        },
      };
    });

    return NextResponse.json(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get snapshots";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
