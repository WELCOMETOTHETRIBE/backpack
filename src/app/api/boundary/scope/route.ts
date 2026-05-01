import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
// syncInheritedControls intentionally NOT imported -- inherited flips happen
// via cloud evidence upload or the manual /dashboard/boundary button, never
// as a side effect of completing the org-profile form.

/** GET /api/boundary/scope — returns current SSP scoping fields for the org */
export async function GET() {
  try {
    const orgId = await requireOrg();
    const [org] = await db
      .select({
        systemName: organizations.systemName,
        systemDescription: organizations.systemDescription,
        authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
        systemOwnerName: organizations.systemOwnerName,
        systemOwnerEmail: organizations.systemOwnerEmail,
        issoName: organizations.issoName,
        issoEmail: organizations.issoEmail,
        cuiCategories: organizations.cuiCategories,
        externalServiceProviders: organizations.externalServiceProviders,
        boundaryNarrative: organizations.boundaryNarrative,
        boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(org);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/** POST /api/boundary/scope — upsert SSP scoping fields */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const body = await req.json();

    const patch: Partial<typeof organizations.$inferInsert> = {};

    if (typeof body.systemName === "string") patch.systemName = body.systemName || null;
    if (typeof body.systemDescription === "string") patch.systemDescription = body.systemDescription || null;
    if (typeof body.authorizationBoundaryStatement === "string")
      patch.authorizationBoundaryStatement = body.authorizationBoundaryStatement || null;
    if (typeof body.systemOwnerName === "string") patch.systemOwnerName = body.systemOwnerName || null;
    if (typeof body.systemOwnerEmail === "string") patch.systemOwnerEmail = body.systemOwnerEmail || null;
    if (typeof body.issoName === "string") patch.issoName = body.issoName || null;
    if (typeof body.issoEmail === "string") patch.issoEmail = body.issoEmail || null;
    if (Array.isArray(body.cuiCategories)) patch.cuiCategories = body.cuiCategories;
    if (Array.isArray(body.externalServiceProviders)) patch.externalServiceProviders = body.externalServiceProviders;
    if (typeof body.boundaryNarrative === "string") patch.boundaryNarrative = body.boundaryNarrative || null;
    if (body.markComplete === true) patch.boundaryScopingCompletedAt = new Date();

    await db.update(organizations).set(patch).where(eq(organizations.id, orgId));

    // INTENTIONALLY do not auto-sync inherited controls on boundary
    // completion. Inherited claims (3.10.x from Azure FedRAMP, plus any
    // external service providers the customer declared) only become
    // adjudicated when actual evidence is in -- via the cloud evidence
    // upload (validate_azure_entra report proves the customer is on Azure
    // Gov) or the manual "Re-sync inherited controls" button on
    // /dashboard/boundary. Onboarding leaves 0/110 adjudicated by design.
    return NextResponse.json({ ok: true, syncResult: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
