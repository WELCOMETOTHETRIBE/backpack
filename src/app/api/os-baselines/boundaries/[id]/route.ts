import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncOrgAzureInheritedControls } from "@/lib/compliance/azure-inherited-controls";

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

const CLOUD_PROVIDER_VALUES = ["none", "microsoft", "google", "azure"] as const;
const AZURE_ENV_VALUES = ["gov", "commercial"] as const;

/**
 * PATCH /api/os-baselines/boundaries/[id]
 * Body: { name?: string; description?: string; cloud_provider?: "none" | "microsoft" | "google" | "azure" | null; azure_environment?: "gov" | "commercial" | null }
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

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    cloud_provider?: string | null;
    azure_environment?: string | null;
  };
  const updates: {
    name?: string;
    description?: string | null;
    cloudProvider?: string | null;
    azureEnvironment?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
  if (body.cloud_provider !== undefined) {
    updates.cloudProvider =
      body.cloud_provider === null || body.cloud_provider === ""
        ? null
        : CLOUD_PROVIDER_VALUES.includes(body.cloud_provider as (typeof CLOUD_PROVIDER_VALUES)[number])
          ? body.cloud_provider
          : existing.cloudProvider ?? null;
  }
  if (body.azure_environment !== undefined) {
    updates.azureEnvironment =
      body.azure_environment === null || body.azure_environment === ""
        ? null
        : AZURE_ENV_VALUES.includes(body.azure_environment as (typeof AZURE_ENV_VALUES)[number])
          ? body.azure_environment
          : existing.azureEnvironment ?? null;
  }

  const [row] = await db
    .update(boundaries)
    .set(updates)
    .where(eq(boundaries.id, id))
    .returning();
  await syncOrgAzureInheritedControls(db, orgId);
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
  await syncOrgAzureInheritedControls(db, orgId);
  return NextResponse.json({ ok: true });
}
