import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
  osAssets,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/evidence-runs/drift?system_id=...
 * Compare latest vs previous run per asset. Returns regressions (was pass, now fail).
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
  const systemIdParam = searchParams.get("system_id");

  const conditions = eq(evidenceRuns.organizationId, orgId);
  const runList = await db
    .select({
      id: evidenceRuns.id,
      systemId: evidenceRuns.systemId,
      runId: evidenceRuns.runId,
      collectedAt: evidenceRuns.collectedAt,
    })
    .from(evidenceRuns)
    .where(systemIdParam ? and(conditions, eq(evidenceRuns.systemId, systemIdParam)) : conditions)
    .orderBy(desc(evidenceRuns.collectedAt));

  const bySystem = new Map<string, typeof runList>();
  for (const r of runList) {
    const list = bySystem.get(r.systemId) ?? [];
    list.push(r);
    bySystem.set(r.systemId, list);
  }

  const results: Array<{
    systemId: string;
    hostname: string | null;
    previousRunId: string;
    previousRunUuid: string;
    latestRunId: string;
    latestRunUuid: string;
    regressions: Array<{ controlId: string }>;
    improvements: Array<{ controlId: string }>;
  }> = [];

  for (const [systemId, runs] of bySystem) {
    if (runs.length < 2) continue;
    const [latest, previous] = runs;

    const [latestStatus, previousStatus] = await Promise.all([
      db
        .select({
          controlId: evidenceControlTechnicalStatus.controlId,
          technicalOk: evidenceControlTechnicalStatus.technicalOk,
        })
        .from(evidenceControlTechnicalStatus)
        .where(eq(evidenceControlTechnicalStatus.evidenceRunId, latest.id)),
      db
        .select({
          controlId: evidenceControlTechnicalStatus.controlId,
          technicalOk: evidenceControlTechnicalStatus.technicalOk,
        })
        .from(evidenceControlTechnicalStatus)
        .where(eq(evidenceControlTechnicalStatus.evidenceRunId, previous.id)),
    ]);

    const prevByControl = new Map(previousStatus.map((r) => [r.controlId, r.technicalOk]));
    const latestByControl = new Map(latestStatus.map((r) => [r.controlId, r.technicalOk]));

    const regressions: Array<{ controlId: string }> = [];
    const improvements: Array<{ controlId: string }> = [];
    for (const { controlId, technicalOk: currentOk } of latestStatus) {
      const prevOk = prevByControl.get(controlId);
      if (prevOk === true && currentOk === false) regressions.push({ controlId });
      if (prevOk === false && currentOk === true) improvements.push({ controlId });
    }

    const [asset] = await db
      .select({ hostname: osAssets.hostname })
      .from(osAssets)
      .where(
        and(
          eq(osAssets.id, systemId),
          eq(osAssets.organizationId, orgId)
        )
      )
      .limit(1);

    results.push({
      systemId,
      hostname: asset?.hostname ?? null,
      previousRunId: previous.runId,
      previousRunUuid: previous.id,
      latestRunId: latest.runId,
      latestRunUuid: latest.id,
      regressions,
      improvements,
    });
  }

  const totalRegressions = results.reduce((s, r) => s + r.regressions.length, 0);

  return NextResponse.json({
    items: results,
    totalRegressions,
  });
}
