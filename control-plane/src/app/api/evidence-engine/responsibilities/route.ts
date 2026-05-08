import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceControlResponsibilities } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export type ResponsibilityRow = {
  controlId: string;
  responsibilityModel: string;
  azureInherited: string[];
  mactechProvided: string[];
  customerRequired: string[];
  notes: string[];
};

/**
 * GET /api/evidence-engine/responsibilities — list control responsibilities for org.
 * Optional query: boundary_id (default org-level, boundary_id null).
 */
export async function GET(request: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(request.url);
    const boundaryId = searchParams.get("boundary_id") ?? null;

    const rows = await db
      .select({
        controlId: governanceControlResponsibilities.controlId,
        responsibilityModel: governanceControlResponsibilities.responsibilityModel,
        azureInheritedJson: governanceControlResponsibilities.azureInheritedJson,
        mactechProvidedJson: governanceControlResponsibilities.mactechProvidedJson,
        customerRequiredJson: governanceControlResponsibilities.customerRequiredJson,
        notesJson: governanceControlResponsibilities.notesJson,
      })
      .from(governanceControlResponsibilities)
      .where(
        boundaryId === null
          ? and(eq(governanceControlResponsibilities.orgId, orgId), sql`${governanceControlResponsibilities.boundaryId} IS NULL`)
          : and(eq(governanceControlResponsibilities.orgId, orgId), eq(governanceControlResponsibilities.boundaryId, boundaryId))
      );

    const list: ResponsibilityRow[] = rows.map((r) => ({
      controlId: r.controlId,
      responsibilityModel: r.responsibilityModel,
      azureInherited: (r.azureInheritedJson ?? []) as string[],
      mactechProvided: (r.mactechProvidedJson ?? []) as string[],
      customerRequired: (r.customerRequiredJson ?? []) as string[],
      notes: (r.notesJson ?? []) as string[],
    }));

    return NextResponse.json(list);
  } catch (e) {
    console.error("GET /api/evidence-engine/responsibilities", e);
    return NextResponse.json({ error: "Failed to load responsibilities" }, { status: 500 });
  }
}
