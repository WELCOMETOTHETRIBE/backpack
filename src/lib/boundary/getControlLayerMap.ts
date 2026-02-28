/**
 * Control → layer map from the latest boundary snapshot (allocations).
 */

import { desc, eq, and } from "drizzle-orm";
import { boundarySnapshots } from "@/db/schema";
import { controlIdToNist } from "@/lib/compliance/controlId";

/**
 * Returns control_id (NIST) → layer from the latest snapshot for the account/boundary.
 * If no snapshot, returns empty Map.
 */
export async function getControlLayerMapFromLatestSnapshot(params: {
  db: any;
  accountId: string;
  boundaryId: string;
}): Promise<Map<string, string | null>> {
  const { db, accountId, boundaryId } = params;
  const [row] = await db
    .select({ snapshotJson: boundarySnapshots.snapshotJson })
    .from(boundarySnapshots)
    .where(
      and(
        eq(boundarySnapshots.accountId, accountId),
        eq(boundarySnapshots.boundaryId, boundaryId)
      )
    )
    .orderBy(desc(boundarySnapshots.createdAt))
    .limit(1);

  const out = new Map<string, string | null>();
  if (!row?.snapshotJson) return out;

  const allocations = (row.snapshotJson as { allocations?: Array<{ control_id?: string; layer?: string; rationale?: { layer?: string } }> })
    ?.allocations ?? [];
  for (const a of allocations) {
    const raw = a?.control_id;
    if (!raw) continue;
    const nistId = controlIdToNist(raw);
    if (!nistId) continue;
    const layer = a.layer ?? (a.rationale as { layer?: string } | undefined)?.layer ?? null;
    out.set(nistId, layer ?? null);
  }
  return out;
}
