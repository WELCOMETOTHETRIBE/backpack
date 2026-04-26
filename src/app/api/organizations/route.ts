import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/organizations
 * Returns the current org's profile (name, cageCode, primaryAddress, primaryContactName, primaryContactEmail, organizationType, cmmcTargetLevel).
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [org] = await db
      .select({
        name: organizations.name,
        cageCode: organizations.cageCode,
        primaryAddress: organizations.primaryAddress,
        primaryContactName: organizations.primaryContactName,
        primaryContactEmail: organizations.primaryContactEmail,
        organizationType: organizations.organizationType,
        cmmcTargetLevel: organizations.cmmcTargetLevel,
        systemName: organizations.systemName,
        systemOwnerName: organizations.systemOwnerName,
        systemOwnerEmail: organizations.systemOwnerEmail,
        issoName: organizations.issoName,
        issoEmail: organizations.issoEmail,
        authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
        boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    return NextResponse.json(org);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get organization";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

const profileSchema = {
  name: (v: unknown) => (typeof v === "string" ? v : undefined),
  cageCode: (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : undefined),
  primaryAddress: (v: unknown) => (typeof v === "string" ? v : undefined),
  primaryContactName: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  primaryContactEmail: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  systemName: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  systemOwnerName: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  systemOwnerEmail: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  issoName: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  issoEmail: (v: unknown) => (typeof v === "string" ? v.slice(0, 255) : undefined),
  authorizationBoundaryStatement: (v: unknown) => (typeof v === "string" ? v : undefined),
};

const SYSTEM_IDENTITY_FIELDS = [
  "systemName",
  "systemOwnerName",
  "systemOwnerEmail",
  "issoName",
  "issoEmail",
  "authorizationBoundaryStatement",
] as const;

/**
 * PATCH /api/organizations
 * Body: { name?, cageCode?, primaryAddress?, primaryContactName?, primaryContactEmail? }
 * Updates the current org's profile fields. Only provided fields are updated.
 */
export async function PATCH(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json().catch(() => ({}));
    const updates: Record<string, string | Date | null> = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const v = profileSchema.name(body.name);
      if (v !== undefined) updates.name = v;
    }
    if (Object.prototype.hasOwnProperty.call(body, "cageCode")) {
      updates.cageCode = profileSchema.cageCode(body.cageCode) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "primaryAddress")) {
      updates.primaryAddress = profileSchema.primaryAddress(body.primaryAddress) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "primaryContactName")) {
      updates.primaryContactName = profileSchema.primaryContactName(body.primaryContactName) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "primaryContactEmail")) {
      updates.primaryContactEmail =
        profileSchema.primaryContactEmail(body.primaryContactEmail) ?? null;
    }
    for (const field of SYSTEM_IDENTITY_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const parser = profileSchema[field];
      const parsed = parser(body[field]);
      const trimmed = typeof parsed === "string" ? parsed.trim() : parsed;
      updates[field] = trimmed && trimmed.length > 0 ? trimmed : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update organization";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
