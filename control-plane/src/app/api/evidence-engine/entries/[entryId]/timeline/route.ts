import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceEntryEvents, governanceRegisterEntries, governanceRegisters, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/evidence-engine/api-errors";

/**
 * GET /api/evidence-engine/entries/[entryId]/timeline — audit trail for an entry.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return errorResponse("entryId required", 400);

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));
    if (!entry) return errorResponse("Entry not found", 404);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.id, entry.registerId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    const events = await db
      .select({
        id: governanceEntryEvents.id,
        eventAt: governanceEntryEvents.eventAt,
        eventType: governanceEntryEvents.eventType,
        eventJson: governanceEntryEvents.eventJson,
        actorUserId: governanceEntryEvents.actorUserId,
        actorEmail: users.email,
        actorName: users.name,
      })
      .from(governanceEntryEvents)
      .leftJoin(users, eq(governanceEntryEvents.actorUserId, users.id))
      .where(
        and(
          eq(governanceEntryEvents.entryId, entryId),
          eq(governanceEntryEvents.orgId, orgId)
        )
      )
      .orderBy(desc(governanceEntryEvents.eventAt));

    return NextResponse.json({ events });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}
