import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

/**
 * Ensures 110 control records exist for the current organization. Idempotent.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const existing = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));

    const existingSet = new Set(existing.map((r) => r.controlId));
    const missing = ALL_CONTROL_IDS.filter((id) => !existingSet.has(id));

    if (missing.length === 0) {
      return NextResponse.json({ ensured: true, created: 0 });
    }

    await db.insert(controlRecords).values(
      missing.map((controlId) => ({
        organizationId: orgId,
        controlId,
      }))
    );

    return NextResponse.json({ ensured: true, created: missing.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to ensure control records";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
