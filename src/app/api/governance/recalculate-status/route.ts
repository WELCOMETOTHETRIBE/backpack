import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { HYBRID_GOVERNANCE_IDS, PURE_GOVERNANCE_IDS } from "@/lib/compliance/control-bins";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * POST /api/governance/recalculate-status
 *
 * Recalculates implementationStatus + technicalStatus for all pure and hybrid
 * governance control records. Controls with no technical evidence requirements
 * will auto-satisfy their technical lane. Returns counts of recalculated and
 * newly-promoted records.
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

    const allGovIds = [...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS];

    const records = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId, implementationStatus: controlRecords.implementationStatus })
      .from(controlRecords)
      .where(and(eq(controlRecords.organizationId, orgId), inArray(controlRecords.controlId, allGovIds)));

    let recalculated = 0;
    let promoted = 0;

    for (const rec of records) {
      // Skip terminal statuses
      if (["assessed", "inherited", "not_applicable"].includes(rec.implementationStatus)) continue;
      const wasBefore = rec.implementationStatus;
      const newStatus = await calculateControlStatus(rec.id);
      recalculated++;
      if (wasBefore !== "implemented" && newStatus === "implemented") promoted++;
    }

    return NextResponse.json({ recalculated, promoted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
