import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamItems, poamMilestones } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;
    const [item] = await db
      .select()
      .from(poamItems)
      .where(
        and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId))
      );
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = await db
      .select()
      .from(poamMilestones)
      .where(eq(poamMilestones.poamItemId, id));
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const [item] = await db
      .select()
      .from(poamItems)
      .where(
        and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId))
      );
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const { title, dueDate, orderIndex } = body;
    const [row] = await db
      .insert(poamMilestones)
      .values({
        poamItemId: id,
        title: title ?? "Milestone",
        dueDate: dueDate ? new Date(dueDate) : null,
        orderIndex: orderIndex ?? 0,
      })
      .returning();
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
