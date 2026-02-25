import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundaryProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getSpecForControl } from "@/lib/artifact-guide";
import { getEvidenceRequirements } from "@/lib/compliance";
import { sprsScoringData } from "@/lib/sprs";

/**
 * GET /api/evidence-requirements?controlId=3.1.1
 * Returns { governance, technical, sprsValue } for the control using the org's boundary profile.
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const controlId = searchParams.get("controlId");
    if (!controlId?.trim()) {
      return NextResponse.json(
        { error: "controlId query parameter is required" },
        { status: 400 }
      );
    }

    const [row] = await db
      .select({ selectedTechnologies: boundaryProfiles.selectedTechnologies })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);

    const profile = row
      ? { selectedTechnologies: (row.selectedTechnologies ?? []) as string[] }
      : null;

    const result = getEvidenceRequirements(controlId.trim(), profile);
    const sprsEntry = sprsScoringData.find((s) => s.id === controlId.trim());
    const spec = getSpecForControl(controlId.trim());
    return NextResponse.json({
      ...result,
      sprsValue: sprsEntry?.value ?? null,
      satisfactionType: spec?.satisfactionType ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get evidence requirements";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
