import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries, osAssets } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { syncOrgAzureInheritedControls } from "@/lib/compliance/azure-inherited-controls";
import { validateScopeComponents } from "@/types/boundary";

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

const AZURE_ENV_VALUES = ["gov", "commercial"] as const;
const CLOUD_PROVIDER_VALUES = ["none", "microsoft", "google", "azure"] as const;

/**
 * POST /api/os-baselines/boundaries — create a boundary.
 * Body: { name: string; description?: string; scope_components?: string[]; azure_environment?: "gov" | "commercial"; cloud_provider?: "none" | "microsoft" | "google" | "azure" }
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    scope_components?: string[];
    azure_environment?: string;
    cloud_provider?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let scopeComponents: string[] | null = null;
  if (body.scope_components !== undefined) {
    const result = validateScopeComponents(body.scope_components);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    scopeComponents = result.value.length > 0 ? result.value : null;
  }

  const cloudProvider =
    body.cloud_provider && CLOUD_PROVIDER_VALUES.includes(body.cloud_provider as (typeof CLOUD_PROVIDER_VALUES)[number])
      ? body.cloud_provider
      : null;

  const hasAzureScope = scopeComponents?.includes("azure_cloud");
  const hasMicrosoftOrAzureCloud = cloudProvider === "microsoft" || cloudProvider === "azure";
  const effectiveHasAzure = hasAzureScope || hasMicrosoftOrAzureCloud;
  const azureEnvironment =
    effectiveHasAzure && body.azure_environment && AZURE_ENV_VALUES.includes(body.azure_environment as (typeof AZURE_ENV_VALUES)[number])
      ? body.azure_environment
      : null;

  const [row] = await db
    .insert(boundaries)
    .values({
      organizationId: orgId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      scopeComponents: scopeComponents ?? null,
      azureEnvironment,
      cloudProvider,
    })
    .returning();

  if (!row) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  await syncOrgAzureInheritedControls(db, orgId);
  return NextResponse.json(row);
}
