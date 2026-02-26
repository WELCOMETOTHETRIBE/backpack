import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries, osAssets } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * GET /api/os-baselines/boundaries — list boundaries for the current org
 * with assetCount and assetsWithBaselineCount per boundary.
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

  if (list.length === 0) return NextResponse.json(list);

  const boundaryIds = list.map((b) => b.id);
  const assets = await db
    .select({
      boundaryId: osAssets.boundaryId,
      baselineProfileId: osAssets.baselineProfileId,
    })
    .from(osAssets)
    .where(
      and(eq(osAssets.organizationId, orgId), inArray(osAssets.boundaryId, boundaryIds))
    );

  const countByBoundary = new Map<string, { assetCount: number; assetsWithBaselineCount: number }>();
  for (const bId of boundaryIds) {
    countByBoundary.set(bId, { assetCount: 0, assetsWithBaselineCount: 0 });
  }
  for (const a of assets) {
    const c = countByBoundary.get(a.boundaryId)!;
    c.assetCount++;
    if (a.baselineProfileId) c.assetsWithBaselineCount++;
  }

  const withCounts = list.map((b) => ({
    ...b,
    assetCount: countByBoundary.get(b.id)?.assetCount ?? 0,
    assetsWithBaselineCount: countByBoundary.get(b.id)?.assetsWithBaselineCount ?? 0,
  }));

  return NextResponse.json(withCounts);
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
