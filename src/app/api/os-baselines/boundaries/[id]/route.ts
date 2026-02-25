import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/os-baselines/boundaries/[id]
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, id), eq(boundaries.organizationId, orgId)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * PATCH /api/os-baselines/boundaries/[id]
 * Body: { name?: string; description?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, id), eq(boundaries.organizationId, orgId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as { name?: string; description?: string };
  const updates: { name?: string; description?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;

  const [row] = await db
    .update(boundaries)
    .set(updates)
    .where(eq(boundaries.id, id))
    .returning();
  return NextResponse.json(row);
}

/**
 * DELETE /api/os-baselines/boundaries/[id]
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, id), eq(boundaries.organizationId, orgId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(boundaries).where(eq(boundaries.id, id));
  return NextResponse.json({ ok: true });
}
