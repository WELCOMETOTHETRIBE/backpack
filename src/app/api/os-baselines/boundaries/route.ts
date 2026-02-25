import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/os-baselines/boundaries — list boundaries for the current org.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await db
    .select()
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  return NextResponse.json(list);
}

/**
 * POST /api/os-baselines/boundaries — create a boundary.
 * Body: { name: string; description?: string }
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; description?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(boundaries)
    .values({
      organizationId: orgId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
    })
    .returning();

  if (!row) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  return NextResponse.json(row);
}
