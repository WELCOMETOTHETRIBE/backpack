import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/control-records/:id/history
 * Returns the immutable change history for a control record.
 * All roles (Admin, Compliance, Assessor) may read history.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    // Verify the record belongs to this org before returning history
    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(and(eq(controlRecords.id, id), eq(controlRecords.organizationId, orgId)))
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entries = await db
      .select()
      .from(controlRecordHistory)
      .where(eq(controlRecordHistory.controlRecordId, id))
      .orderBy(desc(controlRecordHistory.createdAt));

    return NextResponse.json(entries);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
