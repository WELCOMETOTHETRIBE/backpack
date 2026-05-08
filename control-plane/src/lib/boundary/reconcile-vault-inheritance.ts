import { db } from "@/db";
import { boundaries, organizations } from "@/db/schema";
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

  // MacTech Vault is the boundary. If the CUI enclave boundary exists but
  // boundaryScopingCompletedAt is still null (legacy onboarding runs), mark
  // it complete now — there is no separate "complete scoping" step in a
  // Vault-only world.
  const [enclave] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(
      and(
        eq(boundaries.organizationId, orgId),
        eq(boundaries.boundaryType, "cui_enclave")
      )
    )
    .limit(1);

  if (enclave) {
    await db
      .update(organizations)
      .set({ boundaryScopingCompletedAt: new Date() })
      .where(
        and(
          eq(organizations.id, orgId),
          sql`${organizations.boundaryScopingCompletedAt} IS NULL`
        )
      );
  }
}
