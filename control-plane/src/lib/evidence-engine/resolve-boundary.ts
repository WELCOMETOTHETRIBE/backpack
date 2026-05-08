import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export type BoundaryOption = {
  id: string;
  name: string;
  cloudProvider: string | null;
  azureEnvironment: string | null;
  scopeComponents: string[] | null;
};

/**
 * Fetch all boundaries for an org (for selector dropdown).
 */
export async function getBoundariesForOrg(orgId: string): Promise<BoundaryOption[]> {
  const rows = await db
    .select({
      id: boundaries.id,
      name: boundaries.name,
      cloudProvider: boundaries.cloudProvider,
      azureEnvironment: boundaries.azureEnvironment,
      scopeComponents: boundaries.scopeComponents,
    })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .orderBy(asc(boundaries.createdAt));
  return rows as BoundaryOption[];
}

/**
 * Resolve effective boundary id: 1) query param if valid, 2) first boundary for org.
 * Returns { effectiveBoundaryId, boundaries }. effectiveBoundaryId is null if no boundaries exist.
 */
export async function resolveEffectiveBoundary(
  orgId: string,
  boundaryIdFromQuery: string | null | undefined
): Promise<{ effectiveBoundaryId: string | null; boundaries: BoundaryOption[] }> {
  const list = await getBoundariesForOrg(orgId);
  if (list.length === 0) return { effectiveBoundaryId: null, boundaries: [] };
  const fromQuery = boundaryIdFromQuery?.trim();
  if (fromQuery) {
    const found = list.find((b) => b.id === fromQuery);
    if (found) return { effectiveBoundaryId: found.id, boundaries: list };
  }
  return { effectiveBoundaryId: list[0]!.id, boundaries: list };
}
