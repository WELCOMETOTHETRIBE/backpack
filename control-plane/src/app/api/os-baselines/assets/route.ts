import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { osAssets, boundaries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * GET /api/os-baselines/assets
 * List all OS assets for the org (for dropdowns, e.g. evidence bundle upload).
 */
export async function GET() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await db
    .select({
      id: osAssets.id,
      hostname: osAssets.hostname,
      osFamily: osAssets.osFamily,
      osVersion: osAssets.osVersion,
      role: osAssets.role,
      baselineProfileId: osAssets.baselineProfileId,
      boundaryId: osAssets.boundaryId,
    })
    .from(osAssets)
    .where(eq(osAssets.organizationId, orgId));

  const boundaryIds = [...new Set(list.map((a) => a.boundaryId))];
  const boundaryList =
    boundaryIds.length > 0
      ? await db
          .select({ id: boundaries.id, name: boundaries.name })
          .from(boundaries)
          .where(
            and(
              eq(boundaries.organizationId, orgId),
              inArray(boundaries.id, boundaryIds)
            )
          )
      : [];
  const boundaryNames = new Map(boundaryList.map((b) => [b.id, b.name]));

  const withBoundary = list.map((a) => ({
    ...a,
    boundaryName: boundaryNames.get(a.boundaryId) ?? null,
  }));

  return NextResponse.json(withBoundary);
}
