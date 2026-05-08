import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { osAssets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/os-baselines/assets/[id]
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
    .from(osAssets)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * PATCH /api/os-baselines/assets/[id]
 * Body: { hostname?, os_family?, os_version?, role?, baseline_profile_id?, owner?, tags? }
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
    .from(osAssets)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    hostname?: string;
    os_family?: string;
    os_version?: string;
    role?: string;
    baseline_profile_id?: string | null;
    owner?: string | null;
    tags?: string[] | null;
  };
  const updates: {
    hostname?: string;
    osFamily?: "windows_server" | "windows_client" | "linux";
    osVersion?: string;
    role?: "member_server" | "domain_controller" | "workstation";
    baselineProfileId?: string | null;
    owner?: string | null;
    tags?: string[] | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (body.hostname !== undefined) updates.hostname = body.hostname.trim();
  if (body.os_family !== undefined)
    updates.osFamily = body.os_family as "windows_server" | "windows_client" | "linux";
  if (body.os_version !== undefined) updates.osVersion = body.os_version;
  if (body.role !== undefined)
    updates.role = body.role as "member_server" | "domain_controller" | "workstation";
  if (body.baseline_profile_id !== undefined) updates.baselineProfileId = body.baseline_profile_id || null;
  if (body.owner !== undefined) updates.owner = body.owner?.trim() ?? null;
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : null;

  const [row] = await db
    .update(osAssets)
    .set(updates)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)))
    .returning();
  return NextResponse.json(row);
}

/**
 * DELETE /api/os-baselines/assets/[id]
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
    .from(osAssets)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(osAssets).where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  return NextResponse.json({ ok: true });
}
