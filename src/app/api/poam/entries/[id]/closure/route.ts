import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamEntries, poamEntryClosureApprovals, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

const REQUIRED_APPROVALS = 2;

/**
 * POST /api/poam/entries/:id/closure — add current user's sign-off. When 2 approvals, set status to closed.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    if (!user.id) return NextResponse.json({ error: "User not found" }, { status: 401 });
    const { id } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (entry.status === "closed") {
      return NextResponse.json({ error: "Already closed" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(poamEntryClosureApprovals)
      .where(eq(poamEntryClosureApprovals.poamEntryId, id));
    if (existing.some((a) => a.approverId === user.id)) {
      return NextResponse.json({ error: "Already signed off" }, { status: 400 });
    }

    const order = existing.length + 1;
    await db.insert(poamEntryClosureApprovals).values({
      poamEntryId: id,
      approverId: user.id,
      approvalOrder: order,
    });

    if (order >= REQUIRED_APPROVALS) {
      await db
        .update(poamEntries)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(poamEntries.id, id));
    }

    const approvals = await db
      .select({
        approverId: poamEntryClosureApprovals.approverId,
        approvalOrder: poamEntryClosureApprovals.approvalOrder,
        attestedAt: poamEntryClosureApprovals.attestedAt,
        approverEmail: users.email,
      })
      .from(poamEntryClosureApprovals)
      .leftJoin(users, eq(poamEntryClosureApprovals.approverId, users.id))
      .where(eq(poamEntryClosureApprovals.poamEntryId, id));

    return NextResponse.json({ approvals, closed: order >= REQUIRED_APPROVALS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sign off";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
