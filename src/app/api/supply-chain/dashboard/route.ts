import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import {
  subcontractorRelationships,
  organizations,
  controlImplementations,
  poamItems,
  controlRecords,
} from "@/db/schema";
import { eq, and, count, desc } from "drizzle-orm";
import { getSprsScore } from "@/lib/sprs";

/**
 * GET /api/supply-chain/dashboard
 * Returns aggregated status for all of the prime's subcontractors in one call.
 */
export async function GET() {
  try {
    const primeOrgId = await requireOrg();

    const relationships = await db
      .select({
        relationshipId: subcontractorRelationships.id,
        subOrganizationId: subcontractorRelationships.subOrganizationId,
        status: subcontractorRelationships.status,
        subName: organizations.name,
      })
      .from(subcontractorRelationships)
      .leftJoin(
        organizations,
        eq(subcontractorRelationships.subOrganizationId, organizations.id)
      )
      .where(eq(subcontractorRelationships.primeOrganizationId, primeOrgId));

    const results: Array<{
      relationshipId: string;
      subOrganizationId: string | null;
      subName: string | null;
      status: string;
      compliancePct: number;
      sprsScore: number | null;
      openPoams: number;
      lastActivity: string | null;
    }> = [];

    for (const rel of relationships) {
      const subOrgId = rel.subOrganizationId;
      let compliancePct = 0;
      let sprsScore: number | null = null;
      let openPoams = 0;
      let lastActivity: string | null = null;

      if (subOrgId) {
        const [totalImpls] = await db
          .select({ count: count() })
          .from(controlImplementations)
          .where(eq(controlImplementations.organizationId, subOrgId));
        const total = totalImpls?.count ?? 0;
        const [implementedRows] = await db
          .select({ count: count() })
          .from(controlImplementations)
          .where(
            and(
              eq(controlImplementations.organizationId, subOrgId),
              eq(controlImplementations.status, "Implemented")
            )
          );
        const implemented = implementedRows?.count ?? 0;
        compliancePct =
          total > 0 ? Math.round((Number(implemented) / Number(total)) * 100) : 0;

        try {
          sprsScore = await getSprsScore(subOrgId);
        } catch {
          sprsScore = null;
        }

        const [openPoamsRows] = await db
          .select({ count: count() })
          .from(poamItems)
          .where(
            and(
              eq(poamItems.organizationId, subOrgId),
              eq(poamItems.status, "Open")
            )
          );
        openPoams = Number(openPoamsRows?.count ?? 0);

        const [crMax] = await db
          .select({ updatedAt: controlRecords.updatedAt })
          .from(controlRecords)
          .where(eq(controlRecords.organizationId, subOrgId))
          .orderBy(desc(controlRecords.updatedAt))
          .limit(1);
        const [piMax] = await db
          .select({ updatedAt: poamItems.updatedAt })
          .from(poamItems)
          .where(eq(poamItems.organizationId, subOrgId))
          .orderBy(desc(poamItems.updatedAt))
          .limit(1);
        const [ciMax] = await db
          .select({ updatedAt: controlImplementations.updatedAt })
          .from(controlImplementations)
          .where(eq(controlImplementations.organizationId, subOrgId))
          .orderBy(desc(controlImplementations.updatedAt))
          .limit(1);
        const dates = [crMax?.updatedAt, piMax?.updatedAt, ciMax?.updatedAt].filter(
          (d): d is Date => d != null
        );
        if (dates.length > 0) {
          const latest = new Date(
            Math.max(...dates.map((d) => new Date(d).getTime()))
          );
          lastActivity = latest.toISOString();
        }
      }

      results.push({
        relationshipId: rel.relationshipId,
        subOrganizationId: subOrgId,
        subName: rel.subName ?? null,
        status: rel.status,
        compliancePct,
        sprsScore,
        openPoams,
        lastActivity,
      });
    }

    return NextResponse.json({ subcontractors: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
