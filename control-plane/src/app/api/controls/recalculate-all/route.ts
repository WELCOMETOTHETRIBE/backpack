import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { calculateControlStatus } from "@/lib/control-status";

const TERMINAL = ["assessed", "inherited", "not_applicable"] as const;

/**
 * POST /api/controls/recalculate-all
 *
 * Recalculates implementationStatus + technicalStatus for every control record
 * in the organization (all 110). Skips terminal statuses (assessed, inherited,
 * not_applicable). Runs in batches of 10 to avoid overloading the DB.
 *
 * Returns { recalculated, promoted } where promoted = controls that moved to
 * "implemented" from a non-implemented status.
 */
export async function POST() {
  try {
    const session = await auth();
    const user = session?.user as { organizationId?: string; role?: string } | undefined;
    const orgId = user?.organizationId;
    if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["Admin", "Compliance"].includes(user?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const records = await db
      .select({ id: controlRecords.id, implementationStatus: controlRecords.implementationStatus })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          notInArray(controlRecords.implementationStatus, [...TERMINAL])
        )
      );

    let recalculated = 0;
    let promoted = 0;

    const BATCH = 10;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (rec) => {
          const wasBefore = rec.implementationStatus;
          const newStatus = await calculateControlStatus(rec.id).catch(() => null);
          if (newStatus) {
            recalculated++;
            if (wasBefore !== "implemented" && newStatus === "implemented") promoted++;
          }
        })
      );
    }

    return NextResponse.json({ recalculated, promoted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
