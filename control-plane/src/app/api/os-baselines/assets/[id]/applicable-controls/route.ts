import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOsAssetById, resolveApplicableControls } from "@/lib/os-baselines/resolver";
import { db } from "@/db";
import { osAssets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/os-baselines/assets/[id]/applicable-controls
 * Returns controls and checks for this asset (from its baseline profile).
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
  const [asset] = await db
    .select()
    .from(osAssets)
    .where(and(eq(osAssets.id, id), eq(osAssets.organizationId, orgId)));
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await resolveApplicableControls({
    id: asset.id,
    baselineProfileId: asset.baselineProfileId,
  });
  return NextResponse.json(result);
}
