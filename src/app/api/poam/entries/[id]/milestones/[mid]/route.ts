import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamEntries, poamEntryMilestones } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * PATCH /api/poam/entries/:id/milestones/:mid — update milestone (e.g. set completedAt).
 * Body: { title?, dueDate?, completedAt? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const { id, mid } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [milestone] = await db
      .select()
      .from(poamEntryMilestones)
      .where(
        and(
          eq(poamEntryMilestones.id, mid),
          eq(poamEntryMilestones.poamEntryId, id)
        )
      )
      .limit(1);
    if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

    const body = await req.json();
    const updates: {
      title?: string;
      dueDate?: string | null;
      completedAt?: Date | null;
    } = {};
    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.dueDate !== "undefined") updates.dueDate = body.dueDate ?? null;
    if (typeof body.completedAt !== "undefined") {
      updates.completedAt =
        body.completedAt === null || body.completedAt === ""
          ? null
          : new Date(body.completedAt);
    }

    if (Object.keys(updates).length === 0) return NextResponse.json(milestone);

    const [updated] = await db
      .update(poamEntryMilestones)
      .set(updates)
      .where(eq(poamEntryMilestones.id, mid))
      .returning();

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update milestone";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
