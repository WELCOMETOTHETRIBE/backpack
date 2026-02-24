import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundaryProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

const ALLOWED_TECHNOLOGIES = new Set([
  "windows_11",
  "windows_server",
  "rhel",
  "macos",
  "azure_gov",
  "aws_govcloud",
  "entra_id",
  "okta",
  "intune",
  "jamf",
  "defender",
  "crowdstrike",
  "splunk",
  "tenable",
  "palo_alto",
  "cisco_asa",
]);

/**
 * GET /api/boundary-profile
 * Returns the current org's boundary profile (selectedTechnologies). Empty array if none.
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [profile] = await db
      .select({ selectedTechnologies: boundaryProfiles.selectedTechnologies })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);

    return NextResponse.json({
      selectedTechnologies: profile?.selectedTechnologies ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get boundary profile";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/boundary-profile
 * Body: { selectedTechnologies: string[] }. Validates against allowed list; upserts one row per org.
 */
export async function PUT(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const body = await req.json();
    const raw = body.selectedTechnologies;
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "selectedTechnologies must be an array" },
        { status: 400 }
      );
    }
    const selectedTechnologies = raw.filter(
      (v): v is string => typeof v === "string" && ALLOWED_TECHNOLOGIES.has(v)
    );
    const deduped = [...new Set(selectedTechnologies)];

    const [existing] = await db
      .select({ id: boundaryProfiles.id })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);

    const now = new Date();
    if (existing) {
      await db
        .update(boundaryProfiles)
        .set({ selectedTechnologies: deduped, updatedAt: now })
        .where(eq(boundaryProfiles.id, existing.id));
    } else {
      await db.insert(boundaryProfiles).values({
        organizationId: orgId,
        selectedTechnologies: deduped,
      });
    }

    return NextResponse.json({ selectedTechnologies: deduped });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save boundary profile";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
