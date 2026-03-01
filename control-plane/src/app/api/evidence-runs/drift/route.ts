import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceControlTechnicalStatus,
  evidenceFindings,
  osAssets,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

type RunRow = {
  id: string;
  systemId: string;
  runId: string;
  collectedAt: Date;
  source: string | null;
};

/** Get pass/fail by control for a run: from findings (pass = ok) or legacy technical status. */
async function getStatusByControl(
  runId: string
): Promise<Map<string, boolean>> {
  const findings = await db
    .select({ controlId: evidenceFindings.controlId, pass: evidenceFindings.pass })
    .from(evidenceFindings)
    .where(eq(evidenceFindings.evidenceRunId, runId));
  if (findings.length > 0) {
    return new Map(findings.map((f) => [f.controlId, f.pass]));
  }
  const rows = await db
    .select({
      controlId: evidenceControlTechnicalStatus.controlId,
      technicalOk: evidenceControlTechnicalStatus.technicalOk,
    })
    .from(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, runId));
  return new Map(rows.map((r) => [r.controlId, r.technicalOk]));
}

/**
 * GET /api/evidence-runs/drift?system_id=...
 * Compare latest vs previous run per asset and per source (cloud vs OS). Returns regressions (was pass, now fail).
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
      source: evidenceRuns.source,
    })
    .from(evidenceRuns)
    .where(systemIdParam ? and(conditions, eq(evidenceRuns.systemId, systemIdParam)) : conditions)
    .orderBy(desc(evidenceRuns.collectedAt));

  const bySystemAndSource = new Map<string, RunRow[]>();
  for (const r of runList) {
    const key = `${r.systemId}:${r.source ?? "legacy"}`;
    const list = bySystemAndSource.get(key) ?? [];
    list.push(r as RunRow);
    bySystemAndSource.set(key, list);
  }

  const results: Array<{
    source: string;
    systemId: string;
    hostname: string | null;
    previousRunId: string;
    previousRunUuid: string;
    latestRunId: string;
    latestRunUuid: string;
    regressions: Array<{ controlId: string }>;
    improvements: Array<{ controlId: string }>;
  }> = [];

  for (const [key, runs] of bySystemAndSource) {
    if (runs.length < 2) continue;
    const [latest, previous] = runs;
    const source = latest.source ?? "legacy";
    const systemId = latest.systemId;

    const [latestStatus, previousStatus] = await Promise.all([
      getStatusByControl(latest.id),
      getStatusByControl(previous.id),
    ]);

    const regressions: Array<{ controlId: string }> = [];
    const improvements: Array<{ controlId: string }> = [];
    for (const [controlId, currentOk] of latestStatus) {
      const prevOk = previousStatus.get(controlId);
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
      source,
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
  const totalRegressionsCloud = results
    .filter((r) => r.source === "azure_entra")
    .reduce((s, r) => s + r.regressions.length, 0);
  const totalRegressionsOs = results
    .filter((r) => r.source !== "azure_entra")
    .reduce((s, r) => s + r.regressions.length, 0);

  return NextResponse.json({
    items: results,
    totalRegressions,
    totalRegressionsBySource: { cloud: totalRegressionsCloud, os: totalRegressionsOs },
  });
}
