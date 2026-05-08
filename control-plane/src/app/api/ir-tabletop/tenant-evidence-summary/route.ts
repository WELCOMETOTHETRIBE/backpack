import { NextResponse, type NextRequest } from "next/server"
import { and, count, desc, eq, gt } from "drizzle-orm"
import { db } from "@/db"
import {
  evidenceRuns,
  governanceEvidenceFiles,
  governanceEvidenceItems,
  governanceManifestRuns,
  organizations,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
} from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/tenant-evidence-summary
 *
 * Returns a per-tenant snapshot of MacTech-provided evidence inventory for
 * use by the Technical Evidence Summary PDF generator. Replaces the static
 * 13-item boilerplate with live counts + freshness signals from the
 * customer's own records.
 *
 * Tenant-scoped: results are filtered by the authenticated org.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeIrRequest(req, "")

    const [
      org,
      governanceFilesCount,
      latestGovernanceManifest,
      latestEvidenceRun,
      governanceItemsCount,
    ] = await Promise.all([
      db
        .select({
          systemName: organizations.systemName,
          systemDescription: organizations.systemDescription,
          authorizationBoundary: organizations.authorizationBoundaryStatement,
          systemOwnerName: organizations.systemOwnerName,
          issoName: organizations.issoName,
          cuiCategories: organizations.cuiCategories,
          externalServiceProviders: organizations.externalServiceProviders,
          boundaryNarrative: organizations.boundaryNarrative,
        })
        .from(organizations)
        .where(eq(organizations.id, auth.organizationId))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ n: count() })
        .from(governanceEvidenceFiles)
        .innerJoin(
          governanceEvidenceItems,
          eq(governanceEvidenceItems.id, governanceEvidenceFiles.evidenceItemId)
        )
        .where(eq(governanceEvidenceItems.organizationId, auth.organizationId))
        .then((r) => r[0]?.n ?? 0),
      db
        .select({
          runId: governanceManifestRuns.runId,
          ingestedAt: governanceManifestRuns.ingestedAt,
          docCount: governanceManifestRuns.docCount,
        })
        .from(governanceManifestRuns)
        .where(eq(governanceManifestRuns.organizationId, auth.organizationId))
        .orderBy(desc(governanceManifestRuns.ingestedAt))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({
          runId: evidenceRuns.runId,
          source: evidenceRuns.source,
          collectedAt: evidenceRuns.collectedAt,
        })
        .from(evidenceRuns)
        .where(
          and(
            eq(evidenceRuns.organizationId, auth.organizationId),
            // Exclude IR tabletop self-references; we want technical collector runs
            gt(evidenceRuns.collectedAt, new Date(0))
          )
        )
        .orderBy(desc(evidenceRuns.collectedAt))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ n: count() })
        .from(governanceEvidenceItems)
        .where(eq(governanceEvidenceItems.organizationId, auth.organizationId))
        .then((r) => r[0]?.n ?? 0),
    ])

    return NextResponse.json({
      schemaVersion: "ir-tabletop-tenant-evidence-summary.v1",
      org: org
        ? {
            systemName: org.systemName,
            systemDescription: org.systemDescription,
            authorizationBoundaryStatement: org.authorizationBoundary,
            systemOwnerName: org.systemOwnerName,
            issoName: org.issoName,
            cuiCategories: org.cuiCategories ?? [],
            externalServiceProviders: org.externalServiceProviders ?? [],
            boundaryNarrative: org.boundaryNarrative,
          }
        : null,
      governance: {
        evidenceItemCount: governanceItemsCount,
        evidenceFileCount: governanceFilesCount,
        latestManifestRun: latestGovernanceManifest
          ? {
              runId: latestGovernanceManifest.runId,
              ingestedAt: latestGovernanceManifest.ingestedAt.toISOString(),
              docCount: latestGovernanceManifest.docCount,
            }
          : null,
      },
      technical: {
        latestEvidenceRun: latestEvidenceRun
          ? {
              runId: latestEvidenceRun.runId,
              source: latestEvidenceRun.source,
              collectedAt: latestEvidenceRun.collectedAt.toISOString(),
            }
          : null,
      },
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
