import { db } from "@/db";
import { organizations, controlRecords, controlEvidenceLinks, controlRecordHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type ExternalProvider = {
  name: string;
  serviceType: string;
  dataTypes: string[];
  inheritedControls: string[];
  website?: string;
};

export type SyncResult = {
  updated: number;
  skipped: number;
  providerCount: number;
  providers: string[];
};

/**
 * Syncs inherited controls from the org's externalServiceProviders to controlRecords.
 *
 * Only updates controls currently in "not_started" status — already-adjudicated
 * controls are intentionally preserved.
 *
 * For each updated control:
 *   - Sets status to "inherited"
 *   - Sets a standard inheritance narrative
 *   - Creates a controlEvidenceLinks metadata entry (no enclave artifact)
 *   - Writes a controlRecordHistory entry
 *
 * @param orgId - The organization UUID
 * @param actorId - The user UUID performing the sync (for audit trail)
 */
export async function syncInheritedControls(
  orgId: string,
  actorId: string
): Promise<SyncResult> {
  const [org] = await db
    .select({ externalServiceProviders: organizations.externalServiceProviders })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const providers = (org?.externalServiceProviders ?? []) as ExternalProvider[];

  if (providers.length === 0) {
    return { updated: 0, skipped: 0, providerCount: 0, providers: [] };
  }

  // Collect all unique (controlId, provider) pairs
  const providerByControlId = new Map<string, ExternalProvider[]>();
  for (const provider of providers) {
    for (const controlId of provider.inheritedControls ?? []) {
      if (!providerByControlId.has(controlId)) providerByControlId.set(controlId, []);
      providerByControlId.get(controlId)!.push(provider);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  let updated = 0;
  let skipped = 0;

  for (const [controlId, matchedProviders] of providerByControlId.entries()) {
    // Find existing control record
    let [record] = await db
      .select()
      .from(controlRecords)
      .where(and(eq(controlRecords.controlId, controlId), eq(controlRecords.organizationId, orgId)))
      .limit(1);

    // Create the record if it doesn't exist yet (lazy init)
    if (!record) {
      const [inserted] = await db
        .insert(controlRecords)
        .values({ organizationId: orgId, controlId })
        .returning();
      record = inserted;
    }

    // Skip if already adjudicated (anything other than not_started)
    if (record.implementationStatus !== "not_started") {
      skipped++;
      continue;
    }

    // Build narrative from all providers that claim this control
    const providerList = matchedProviders
      .map((p) => `${p.name} (${p.serviceType})`)
      .join(", ");
    const primaryProvider = matchedProviders[0];

    const narrative =
      `This control is satisfied through inheritance from ${providerList}. ` +
      `Refer to the provider's Customer Responsibility Matrix or equivalent ` +
      `documentation for implementation details.`;

    // Update control record to inherited
    await db
      .update(controlRecords)
      .set({ implementationStatus: "inherited", governanceNarrative: narrative, updatedAt: new Date() })
      .where(eq(controlRecords.id, record.id));

    // Create evidence metadata entry — metadata only, no CUI artifact
    await db.insert(controlEvidenceLinks).values({
      organizationId: orgId,
      controlRecordId: record.id,
      runId: `INHERITED-${primaryProvider.name.replace(/\W+/g, "-").toUpperCase()}-${today}`,
      filePath: `External — ${primaryProvider.name} service agreement / CRM`,
      sha256Hash: "N/A — inherited control, no enclave artifact",
      description: `Auto-linked during boundary sync. Provider: ${providerList}.`,
      source: primaryProvider.name,
    });

    // Write audit history entry
    await db.insert(controlRecordHistory).values({
      controlRecordId: record.id,
      changedById: actorId,
      fieldName: "implementationStatus",
      oldValue: record.implementationStatus,
      newValue: "inherited",
    });

    updated++;
  }

  const activeProviderNames = providers
    .filter((p) => (p.inheritedControls ?? []).length > 0)
    .map((p) => p.name);

  return {
    updated,
    skipped,
    providerCount: activeProviderNames.length,
    providers: activeProviderNames,
  };
}
