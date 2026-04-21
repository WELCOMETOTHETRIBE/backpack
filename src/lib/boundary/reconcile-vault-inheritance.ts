import { db } from "@/db";
import { boundaries } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { syncOrgAzureInheritedControls } from "@/lib/compliance/azure-inherited-controls";

/**
 * Ensures the MacTech CUI Vault boundary has cloudProvider/azureEnvironment
 * populated and that Azure physical-protection inheritance (3.10.1–3.10.5) is
 * reflected on control records. Safe to call repeatedly; each piece is a
 * no-op when already reconciled.
 *
 * Necessary because early onboarding runs created the MacTech CUI Vault
 * boundary without cloud metadata, which suppressed the inheritance sync.
 */
export async function reconcileMacTechVaultInheritance(orgId: string): Promise<void> {
  const updated = await db
    .update(boundaries)
    .set({ cloudProvider: "azure", azureEnvironment: "gov", updatedAt: new Date() })
    .where(
      and(
        eq(boundaries.organizationId, orgId),
        eq(boundaries.boundaryType, "cui_enclave"),
        sql`(${boundaries.cloudProvider} IS NULL OR ${boundaries.azureEnvironment} IS NULL)`
      )
    )
    .returning({ id: boundaries.id });

  // Always run the sync — it's a short update on at most five rows, and it
  // corrects drift regardless of whether the boundary row itself changed.
  await syncOrgAzureInheritedControls(db, orgId);
  void updated;
}
