import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries, boundaryComponents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/os-baselines/boundaries/[id]/components/[componentId]
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> }
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId, componentId } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [component] = await db
    .select()
    .from(boundaryComponents)
    .where(
      and(
        eq(boundaryComponents.id, componentId),
        eq(boundaryComponents.boundaryId, boundaryId)
      )
    );
  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(boundaryComponents).where(eq(boundaryComponents.id, componentId));
  return NextResponse.json({ ok: true });
}
