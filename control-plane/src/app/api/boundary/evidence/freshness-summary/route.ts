import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, evidenceRuns, evidenceFindings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { computeFreshnessStatus } from "@/lib/evidence/freshnessPolicy";

/**
 * GET /api/boundary/evidence/freshness-summary
 * Returns freshness counts (fresh, stale, unknown) and top stale layers for the account's boundary.
 * Uses the latest run per source (or latest run overall) and its findings.
 */
export async function GET() {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [boundary] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundary?.boundaryId) {
      return NextResponse.json({
        fresh: 0,
        stale: 0,
        unknown: 0,
        top_stale_layers: [],
      });
    }

    const runs = await db
      .select({
        id: evidenceRuns.id,
        collectedAt: evidenceRuns.collectedAt,
        source: evidenceRuns.source,
      })
      .from(evidenceRuns)
      .where(eq(evidenceRuns.boundaryId, boundary.boundaryId))
      .orderBy(desc(evidenceRuns.collectedAt))
      .limit(10);

    if (runs.length === 0) {
      return NextResponse.json({
        fresh: 0,
        stale: 0,
        unknown: 0,
        top_stale_layers: [],
      });
    }

    const runIds = runs.map((r) => r.id);
    const findings = await db
      .select({
        evidenceRunId: evidenceFindings.evidenceRunId,
        layer: evidenceFindings.layer,
      })
      .from(evidenceFindings)
      .where(
        eq(evidenceFindings.evidenceRunId, runIds[0])
      );

    const runById = new Map(runs.map((r) => [r.id, r]));
    let fresh = 0;
    let stale = 0;
    let unknown = 0;
    const staleLayers = new Map<string, number>();

    for (const f of findings) {
      const run = runById.get(f.evidenceRunId);
      if (!run) continue;
      const collectedAtIso =
        run.collectedAt instanceof Date ? run.collectedAt.toISOString() : String(run.collectedAt);
      const result = computeFreshnessStatus(collectedAtIso, f.layer);
      if (result.status === "fresh") fresh++;
      else if (result.status === "stale") {
        stale++;
        const layerKey = f.layer ?? "(no layer)";
        staleLayers.set(layerKey, (staleLayers.get(layerKey) ?? 0) + 1);
      } else unknown++;
    }

    const top_stale_layers = Array.from(staleLayers.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([layer]) => layer);

    return NextResponse.json({
      fresh,
      stale,
      unknown,
      top_stale_layers: top_stale_layers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get freshness summary";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
