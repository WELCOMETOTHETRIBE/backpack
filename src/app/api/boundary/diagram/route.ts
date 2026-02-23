import { NextResponse } from "next/server";
import { db } from "@/db";
import { boundaryProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { generateMermaidSource } from "@/lib/compliance/diagram-generator";

/**
 * GET /api/boundary/diagram
 * Returns Mermaid source for the current org's boundary profile.
 * Client renders with mermaid package (no server-side SVG).
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [row] = await db
      .select({ selectedTechnologies: boundaryProfiles.selectedTechnologies })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);

    const profile = (row?.selectedTechnologies ?? []) as string[];
    const mermaidSource = generateMermaidSource(profile);

    return NextResponse.json({ mermaidSource });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get diagram";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
