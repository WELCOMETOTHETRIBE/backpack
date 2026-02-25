import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  osAssets,
  evidenceRuns,
  evidenceControlTechnicalStatus,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/os-baselines/assets/[id]/evidence-status
 * Returns latest evidence run for this asset and per-control status rows.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  const [asset] = await db
    .select()
    .from(osAssets)
    .where(and(eq(osAssets.id, assetId), eq(osAssets.organizationId, orgId)));
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Runs where system_id = this asset
  const runs = await db
    .select()
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.systemId, assetId)
      )
    )
    .orderBy(desc(evidenceRuns.collectedAt))
    .limit(5);

  const latestRun = runs[0] ?? null;
  let statusRows: Array<{
    controlId: string;
    technicalOk: boolean;
    missingFiles: unknown;
    presentFiles: unknown;
  }> = [];

  if (latestRun) {
    statusRows = await db
      .select({
        controlId: evidenceControlTechnicalStatus.controlId,
        technicalOk: evidenceControlTechnicalStatus.technicalOk,
        missingFiles: evidenceControlTechnicalStatus.missingFiles,
        presentFiles: evidenceControlTechnicalStatus.presentFiles,
      })
      .from(evidenceControlTechnicalStatus)
      .where(eq(evidenceControlTechnicalStatus.evidenceRunId, latestRun.id));
  }

  return NextResponse.json({
    assetId,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          runId: latestRun.runId,
          collectedAt: latestRun.collectedAt,
          collectorName: latestRun.collectorName,
        }
      : null,
    statusRows,
    recentRuns: runs.map((r) => ({
      id: r.id,
      runId: r.runId,
      collectedAt: r.collectedAt,
    })),
  });
}
