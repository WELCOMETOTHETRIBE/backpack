import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamEntries, poamEntryMilestones } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * POST /api/poam/entries/:id/milestones — add a milestone.
 * Body: { title, dueDate? }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [entry] = await db
      .select()
      .from(poamEntries)
      .where(and(eq(poamEntries.id, id), eq(poamEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    const count = await db
      .select()
      .from(poamEntryMilestones)
      .where(eq(poamEntryMilestones.poamEntryId, id));

    const [inserted] = await db
      .insert(poamEntryMilestones)
      .values({
        poamEntryId: id,
        title,
        dueDate: body.dueDate ?? null,
        orderIndex: count.length,
      })
      .returning();

    return NextResponse.json(inserted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add milestone";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
