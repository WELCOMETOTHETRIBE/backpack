import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries, osAssets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/os-baselines/boundaries/[id]/assets — list OS assets in this boundary.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) return NextResponse.json({ error: "Boundary not found" }, { status: 404 });

  const list = await db
    .select()
    .from(osAssets)
    .where(eq(osAssets.boundaryId, boundaryId));
  return NextResponse.json(list);
}

/**
 * POST /api/os-baselines/boundaries/[id]/assets — add an OS asset.
 * Body: { hostname, os_family, os_version, role, baseline_profile_id?, owner?, tags? }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) return NextResponse.json({ error: "Boundary not found" }, { status: 404 });

  const body = (await req.json()) as {
    hostname?: string;
    os_family?: string;
    os_version?: string;
    role?: string;
    baseline_profile_id?: string | null;
    owner?: string | null;
    tags?: string[] | null;
  };
  if (!body.hostname?.trim()) {
    return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  }
  const osFamily = (body.os_family ?? "windows_server") as "windows_server" | "windows_client" | "linux";
  const role = (body.role ?? "member_server") as "member_server" | "domain_controller" | "workstation";

  const [row] = await db
    .insert(osAssets)
    .values({
      organizationId: orgId,
      boundaryId,
      hostname: body.hostname.trim(),
      osFamily,
      osVersion: (body.os_version ?? "2025").trim(),
      role,
      baselineProfileId: body.baseline_profile_id || null,
      owner: body.owner?.trim() || null,
      tags: Array.isArray(body.tags) ? body.tags : null,
    })
    .returning();

  if (!row) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  return NextResponse.json(row);
}
