import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
  evidenceFindings,
  osAssets,
} from "@/db/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/evidence-runs?system_id=...&limit=20&page=1
 * List evidence runs for the org with summary counts (total controls, passed).
 */
export async function GET(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const systemId = searchParams.get("system_id");
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const offset = (page - 1) * limit;

  const conditions = eq(evidenceRuns.organizationId, orgId);
  const withSystem = systemId
    ? and(conditions, eq(evidenceRuns.systemId, systemId))
    : conditions;

  const runs = await db
    .select({
      id: evidenceRuns.id,
      runId: evidenceRuns.runId,
      systemId: evidenceRuns.systemId,
      collectedAt: evidenceRuns.collectedAt,
      collectorName: evidenceRuns.collectorName,
      collectorVersion: evidenceRuns.collectorVersion,
      source: evidenceRuns.source,
    })
    .from(evidenceRuns)
    .where(withSystem)
    .orderBy(desc(evidenceRuns.collectedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = runs.length > limit;
  const list = hasMore ? runs.slice(0, limit) : runs;

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidenceRuns)
    .where(withSystem);
  const total = countResult[0]?.count ?? 0;

  const assetsWithRunsResult = await db
    .select({
      count: sql<number>`count(distinct ${evidenceRuns.systemId})::int`,
    })
    .from(evidenceRuns)
    .innerJoin(osAssets, and(eq(osAssets.id, evidenceRuns.systemId), eq(osAssets.organizationId, evidenceRuns.organizationId)))
    .where(eq(evidenceRuns.organizationId, orgId));
  const assetsWithRuns = assetsWithRunsResult[0]?.count ?? 0;

  const assetIds = [...new Set(list.map((r) => r.systemId))];
  const assets =
    assetIds.length > 0
      ? await db
          .select({ id: osAssets.id, hostname: osAssets.hostname })
          .from(osAssets)
          .where(
            and(
              eq(osAssets.organizationId, orgId),
              inArray(osAssets.id, assetIds)
            )
          )
      : [];
  const assetMap = new Map(assets.map((a) => [a.id, a.hostname]));

  const withSummary = await Promise.all(
    list.map(async (run) => {
      const findings = await db
        .select({
          pass: evidenceFindings.pass,
          partial: evidenceFindings.partial,
        })
        .from(evidenceFindings)
        .where(eq(evidenceFindings.evidenceRunId, run.id));
      if (findings.length > 0) {
        const totalControls = findings.length;
        const passed = findings.filter((f) => f.pass && !f.partial).length;
        const partial = findings.filter((f) => f.partial).length;
        return {
          ...run,
          hostname: assetMap.get(run.systemId) ?? null,
          totalControls,
          passed,
          partial,
        };
      }
      const rows = await db
        .select({
          technicalOk: evidenceControlTechnicalStatus.technicalOk,
        })
        .from(evidenceControlTechnicalStatus)
        .where(eq(evidenceControlTechnicalStatus.evidenceRunId, run.id));
      const totalControls = rows.length;
      const passed = rows.filter((r) => r.technicalOk).length;
      return {
        ...run,
        hostname: assetMap.get(run.systemId) ?? null,
        totalControls,
        passed,
        partial: 0,
      };
    })
  );

  return NextResponse.json({
    items: withSummary,
    total,
    limit,
    page,
    assetsWithRuns,
  });
}
