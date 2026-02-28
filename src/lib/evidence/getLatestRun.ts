/**
 * Latest evidence run for a boundary and source (e.g. windows_server_hardening).
 */

import { desc, eq, and } from "drizzle-orm";
import { evidenceRuns } from "@/db/schema";

export interface LatestRunResult {
  evidenceRunId: string;
  collectedAt: string;
  runFingerprint: string;
}

/**
 * Returns the latest run for the given boundary and source, or null.
 */
export async function getLatestRunForSource(params: {
  db: any;
  organizationId: string;
  boundaryId: string;
  source: string;
}): Promise<LatestRunResult | null> {
  const { db, organizationId, boundaryId, source } = params;
  const [row] = await db
    .select({
      id: evidenceRuns.id,
      collectedAt: evidenceRuns.collectedAt,
      runFingerprint: evidenceRuns.runFingerprint,
    })
    .from(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, organizationId),
        eq(evidenceRuns.boundaryId, boundaryId),
        eq(evidenceRuns.source, source)
      )
    )
    .orderBy(desc(evidenceRuns.collectedAt))
    .limit(1);

  if (!row) return null;
  return {
    evidenceRunId: row.id,
    collectedAt: row.collectedAt instanceof Date ? row.collectedAt.toISOString() : String(row.collectedAt),
    runFingerprint: row.runFingerprint,
  };
}
