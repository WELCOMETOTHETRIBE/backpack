import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary, evidenceRuns, evidenceFindings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/boundary/evidence/by-layer
 * Returns latest findings grouped by layer for the account's boundary.
 * Each layer has the most recent finding per control (by collected_at).
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
      return NextResponse.json({ by_layer: {} });
    }

    const rows = await db
      .select({
        controlId: evidenceFindings.controlId,
        pass: evidenceFindings.pass,
        partial: evidenceFindings.partial,
        observed: evidenceFindings.observed,
        expected: evidenceFindings.expected,
        evidenceHint: evidenceFindings.evidenceHint,
        evidenceFilesUsed: evidenceFindings.evidenceFilesUsed,
        providerOrCustomer: evidenceFindings.providerOrCustomer,
        layer: evidenceFindings.layer,
        collectedAt: evidenceRuns.collectedAt,
        source: evidenceRuns.source,
        runId: evidenceRuns.runId,
      })
      .from(evidenceFindings)
      .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
      .where(eq(evidenceRuns.boundaryId, boundary.boundaryId))
      .orderBy(desc(evidenceRuns.collectedAt));

    const byLayer: Record<
      string,
      Array<{
        control_id: string;
        pass: boolean;
        observed: string;
        expected: string;
        evidence_hint: string;
        evidence_files_used: string[];
        provider_or_customer: string;
        collected_at: Date;
        source: string | null;
        run_id: string;
      }>
    > = {};
    const seenControls = new Set<string>();

    for (const r of rows) {
      const layerKey = r.layer ?? "(no layer)";
      if (!seenControls.has(r.controlId)) {
        seenControls.add(r.controlId);
        if (!byLayer[layerKey]) byLayer[layerKey] = [];
        byLayer[layerKey].push({
          control_id: r.controlId,
          pass: r.pass,
          observed: r.observed,
          expected: r.expected,
          evidence_hint: r.evidenceHint,
          evidence_files_used: (r.evidenceFilesUsed ?? []) as string[],
          provider_or_customer: r.providerOrCustomer,
          collected_at: r.collectedAt,
          source: r.source,
          run_id: r.runId,
        });
      }
    }

    return NextResponse.json({ by_layer: byLayer });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get findings by layer";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
