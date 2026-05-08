import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { HYBRID_GOVERNANCE_IDS, PURE_GOVERNANCE_IDS } from "@/lib/compliance/control-bins";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * POST /api/governance/recalculate-status
 *
 * Recalculates implementationStatus + technicalStatus for every control
 * record whose state can change as a downstream effect of a governance,
 * register, or evidence update. In scope:
 *   • all pure-governance controls
 *   • all hybrid (governance + technical) controls
 *   • all register-gated controls (anything with CONTROL_INTELLIGENCE.registerRequired)
 *
 * Returns counts of recalculated and newly-promoted records.
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

    const registerGatedIds = CONTROL_INTELLIGENCE
      .filter((c) => c.registerRequired)
      .map((c) => c.controlId);
    const scopedIds = Array.from(
      new Set([...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS, ...registerGatedIds])
    );

    const records = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId, implementationStatus: controlRecords.implementationStatus })
      .from(controlRecords)
      .where(and(eq(controlRecords.organizationId, orgId), inArray(controlRecords.controlId, scopedIds)));

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
