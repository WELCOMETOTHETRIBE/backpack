import { NextResponse } from "next/server";
import { db } from "@/db";
import { evidenceRuns, evidenceControlTechnicalStatus, osAssets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/evidence-runs/[runId]
 * Single run by run uuid (primary key) or by runId string, with full per-control status.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const byId = UUID_REGEX.test(runId);
  const [run] = await db
    .select()
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        byId ? eq(evidenceRuns.id, runId) : eq(evidenceRuns.runId, runId)
      )
    )
    .limit(1);

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const statusRows = await db
    .select({
      controlId: evidenceControlTechnicalStatus.controlId,
      technicalOk: evidenceControlTechnicalStatus.technicalOk,
      missingFiles: evidenceControlTechnicalStatus.missingFiles,
      presentFiles: evidenceControlTechnicalStatus.presentFiles,
    })
    .from(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, run.id));

  const [asset] = await db
    .select({ hostname: osAssets.hostname })
    .from(osAssets)
    .where(
      and(
        eq(osAssets.id, run.systemId),
        eq(osAssets.organizationId, orgId)
      )
    )
    .limit(1);

  const summary = {
    total: statusRows.length,
    passed: statusRows.filter((r) => r.technicalOk).length,
    failed: statusRows.filter((r) => !r.technicalOk).length,
  };

  return NextResponse.json({
    run: {
      id: run.id,
      runId: run.runId,
      systemId: run.systemId,
      collectedAt: run.collectedAt,
      collectorName: run.collectorName,
      collectorVersion: run.collectorVersion,
      bundleRoot: run.bundleRoot,
    },
    hostname: asset?.hostname ?? null,
    summary,
    statusRows,
  });
}
