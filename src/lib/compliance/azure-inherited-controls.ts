/**
 * When a boundary uses Microsoft or Azure (Government or Commercial), the org
 * inherits controls 3.10.1–3.10.5 from the platform. This module applies or
 * clears that inherited status on control records.
 */
import { db } from "@/db";
import { controlRecords, boundaries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const AZURE_INHERITED_3_10_CONTROL_IDS = [
  "3.10.1",
  "3.10.2",
  "3.10.3",
  "3.10.4",
  "3.10.5",
] as const;

/**
 * Applies or clears inherited status for controls 3.10.1–3.10.5 based on
 * whether any boundary in the org has Microsoft or Azure cloud hosting.
 * Call after creating/updating/deleting boundaries so inherited state stays in sync.
 */
export async function syncOrgAzureInheritedControls(
  dbInstance: typeof db,
  orgId: string
): Promise<void> {
  const azureBoundaries = await dbInstance
    .select({ cloudProvider: boundaries.cloudProvider, azureEnvironment: boundaries.azureEnvironment })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(100);

  const firstAzure = azureBoundaries.find(
    (b) => b.cloudProvider === "microsoft" || b.cloudProvider === "azure"
  );
  const inheritedFrom = firstAzure
    ? firstAzure.azureEnvironment === "gov"
      ? "Azure Government"
      : "Azure Commercial"
    : null;

  const existing = await dbInstance
    .select({ id: controlRecords.id, controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        inArray(controlRecords.controlId, [...AZURE_INHERITED_3_10_CONTROL_IDS])
      )
    );

  const existingSet = new Set(existing.map((r) => r.controlId));
  const missing = AZURE_INHERITED_3_10_CONTROL_IDS.filter((id) => !existingSet.has(id));
  if (missing.length > 0) {
    await dbInstance.insert(controlRecords).values(
      missing.map((controlId) => ({
        organizationId: orgId,
        controlId,
      }))
    );
  }

  if (inheritedFrom) {
    await dbInstance
      .update(controlRecords)
      .set({
        implementationStatus: "inherited",
        inheritedFrom,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          inArray(controlRecords.controlId, [...AZURE_INHERITED_3_10_CONTROL_IDS])
        )
      );
  } else {
    await dbInstance
      .update(controlRecords)
      .set({
        implementationStatus: "not_started",
        inheritedFrom: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          inArray(controlRecords.controlId, [...AZURE_INHERITED_3_10_CONTROL_IDS])
        )
      );
  }
}
