import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import {
  subcontractorRelationships,
  controlImplementations,
  poamItems,
  controls,
} from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getSprsScore } from "@/lib/sprs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subOrganizationId: string }> }
) {
  try {
    const primeOrgId = await requireOrg();
    const { subOrganizationId } = await params;

    // Step 1: Verify authentication
    if (!primeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 2: Verify subcontractor relationship exists and is active
    const [relationship] = await db
      .select()
      .from(subcontractorRelationships)
      .where(
        and(
          eq(subcontractorRelationships.primeOrganizationId, primeOrgId),
          eq(subcontractorRelationships.subOrganizationId, subOrganizationId),
          eq(subcontractorRelationships.status, "Active")
        )
      )
      .limit(1);

    if (!relationship) {
      return NextResponse.json({ error: "Forbidden: No active relationship" }, { status: 403 });
    }

    // Fetch metadata-only status information
    const sprsScore = await getSprsScore(subOrganizationId);
    
    // Calculate compliance percentage based on implemented controls
    const totalImpls = await db
      .select({ count: count() })
      .from(controlImplementations)
      .where(eq(controlImplementations.organizationId, subOrganizationId));
    
    const totalControls = totalImpls[0]?.count || 110;
    const implementedCount = await db
      .select({ count: count() })
      .from(controlImplementations)
      .where(
        and(
          eq(controlImplementations.organizationId, subOrganizationId),
          eq(controlImplementations.status, "Implemented")
        )
      );
    
    const implemented = implementedCount[0]?.count || 0;
    const compliancePct = totalControls > 0 ? Math.round((implemented / totalControls) * 100) : 0;

    // Count open POA&Ms by severity
    const openPoams = await db
      .select({ count: count() })
      .from(poamItems)
      .where(
        and(
          eq(poamItems.organizationId, subOrganizationId),
          eq(poamItems.status, "Open")
        )
      );

    const openPoamsCount = openPoams[0]?.count || 0;

    // Certification status (simplified - would check attestations in production)
    const certificationStatus =
      implemented === totalControls ? "C3PAO Certified" : implemented > 0 ? "Self-Attested" : "Not Started";

    return NextResponse.json({
      complianceScore: compliancePct,
      sprsScore,
      openPoams: openPoamsCount,
      certificationStatus,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
