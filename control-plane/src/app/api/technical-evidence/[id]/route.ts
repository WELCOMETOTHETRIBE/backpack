import { NextResponse } from "next/server";
import { db } from "@/db";
import { technicalEvidence } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { calculateControlStatus } from "@/lib/control-status";

/**
 * DELETE /api/technical-evidence/:id — delete technical evidence and recalculate control status.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [row] = await db
      .select()
      .from(technicalEvidence)
      .where(
        and(
          eq(technicalEvidence.id, id),
          eq(technicalEvidence.organizationId, orgId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const controlRecordId = row.controlRecordId;
    await db.delete(technicalEvidence).where(eq(technicalEvidence.id, id));
    await calculateControlStatus(controlRecordId);

    return NextResponse.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
