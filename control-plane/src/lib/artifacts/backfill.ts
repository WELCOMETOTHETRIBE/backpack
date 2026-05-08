import { db } from "@/db";
import { artifacts } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { MILESTONES_BY_KEY } from "@/data/cmmc/client-required-artifacts";

export type RefreshResult = {
  scanned: number;
  updated: number;
};

/**
 * Idempotent refresh: for every artifact row with a `milestoneKey`, re-read
 * the catalog entry and sync `expectedClosureType / expectedEvidenceType /
 * expectedCadence` in place. Does NOT touch file fields, status, or links —
 * this is purely metadata alignment so placeholders created before a catalog
 * change reflect the new preferred closure path.
 */
export async function refreshPlaceholderMetadata(
  orgId: string
): Promise<RefreshResult> {
  const rows = await db
    .select({
      id: artifacts.id,
      milestoneKey: artifacts.milestoneKey,
      expectedClosureType: artifacts.expectedClosureType,
      expectedEvidenceType: artifacts.expectedEvidenceType,
      expectedCadence: artifacts.expectedCadence,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.organizationId, orgId),
        isNotNull(artifacts.milestoneKey)
      )
    );

  let updated = 0;
  for (const r of rows) {
    const catalog = r.milestoneKey ? MILESTONES_BY_KEY.get(r.milestoneKey) : undefined;
    if (!catalog) continue;

    const needsUpdate =
      r.expectedClosureType !== catalog.closureType ||
      r.expectedEvidenceType !== catalog.evidenceType ||
      r.expectedCadence !== catalog.cadence;

    if (!needsUpdate) continue;

    await db
      .update(artifacts)
      .set({
        expectedClosureType: catalog.closureType,
        expectedEvidenceType: catalog.evidenceType,
        expectedCadence: catalog.cadence,
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, r.id));
    updated++;
  }

  return { scanned: rows.length, updated };
}
