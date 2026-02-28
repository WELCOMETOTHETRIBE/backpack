/**
 * GET /api/boundary/evidence/runs?source=windows_server_hardening
 * Lists evidence runs for the account's boundary (optional source filter).
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, evidenceRuns } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [boundary] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundary?.boundaryId) {
      return NextResponse.json({ runs: [] });
    }

    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source")?.trim();

    const conditions = [
      eq(evidenceRuns.organizationId, accountId),
      eq(evidenceRuns.boundaryId, boundary.boundaryId),
    ];
    if (source) conditions.push(eq(evidenceRuns.source, source));

    const runs = await db
      .select({
        id: evidenceRuns.id,
        runId: evidenceRuns.runId,
        systemId: evidenceRuns.systemId,
        collectedAt: evidenceRuns.collectedAt,
        collectorName: evidenceRuns.collectorName,
        collectorVersion: evidenceRuns.collectorVersion,
        runFingerprint: evidenceRuns.runFingerprint,
        source: evidenceRuns.source,
      })
      .from(evidenceRuns)
      .where(and(...conditions))
      .orderBy(desc(evidenceRuns.collectedAt))
      .limit(100);

    const runsPayload = runs.map((r) => ({
      id: r.id,
      evidence_run_id: r.id,
      run_id: r.runId,
      system_id: r.systemId,
      collected_at: r.collectedAt instanceof Date ? r.collectedAt.toISOString() : String(r.collectedAt),
      run_fingerprint: r.runFingerprint,
      source: r.source ?? null,
      // for existing boundary page list
      runId: r.runId,
      systemId: r.systemId,
      collectedAt: r.collectedAt instanceof Date ? r.collectedAt.toISOString() : String(r.collectedAt),
      collectorName: r.collectorName,
      collectorVersion: r.collectorVersion,
    }));

    return NextResponse.json({ runs: runsPayload });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list runs";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
