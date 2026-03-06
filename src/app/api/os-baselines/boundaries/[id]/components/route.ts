import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries, boundaryComponents } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const COMPONENT_TYPES = ["network_device", "vm", "bare_metal"] as const;

async function requireBoundary(orgId: string, boundaryId: string) {
  const [row] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  return row ?? null;
}

/**
 * GET /api/os-baselines/boundaries/[id]/components — list additional boundary components
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId } = await params;
  const boundary = await requireBoundary(orgId, boundaryId);
  if (!boundary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const list = await db
    .select()
    .from(boundaryComponents)
    .where(eq(boundaryComponents.boundaryId, boundaryId));
  return NextResponse.json(list);
}

/**
 * POST /api/os-baselines/boundaries/[id]/components — add a boundary component
 * Body: { name: string; component_type: "network_device" | "vm" | "bare_metal"; notes?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId } = await params;
  const boundary = await requireBoundary(orgId, boundaryId);
  if (!boundary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as {
    name?: string;
    component_type?: string;
    notes?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const componentType =
    body.component_type && COMPONENT_TYPES.includes(body.component_type as (typeof COMPONENT_TYPES)[number])
      ? (body.component_type as (typeof COMPONENT_TYPES)[number])
      : "network_device";

  const [row] = await db
    .insert(boundaryComponents)
    .values({
      boundaryId,
      name: body.name.trim(),
      componentType,
      notes: body.notes?.trim() || null,
    })
    .returning();
  if (!row) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  return NextResponse.json(row);
}
