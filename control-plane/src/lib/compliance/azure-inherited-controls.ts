/**
 * Strict-inherited 3.10 controls — the four physical-protection controls that
 * Microsoft Azure handles 100% under FedRAMP High with no customer attestation
 * needed.
 *
 * 3.10.3 (Visitor Records) and 3.10.6 (Alternate Work Sites) are deliberately
 * NOT in this list — they're customer-attested-inherited. The customer must
 * sign an attestation that the conditions hold (no on-site visitors with CUI
 * access; no uncontrolled telework). See `CUSTOMER_ATTESTED_INHERITED` in
 * src/lib/compliance/outstanding-controls.ts and the corresponding
 * attestation templates (`attest_no_onsite_cui_visitors`,
 * `attest_no_alternate_work_sites`). Until the customer signs, those two
 * stay PARTIAL — the auto-sync below cannot grant them inherited status.
 *
 * Reconciled 2026-05-01: 3.10.3 was previously dual-classified (in this list
 * AND in CUSTOMER_ATTESTED_INHERITED), causing the auto-sync to flip it to
 * inherited before the customer ever signed the attestation. C3PAO concern:
 * claim happened before proof. Fixed by removing 3.10.3 from this list.
 */
import { db } from "@/db";
import { controlRecords, boundaries } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const AZURE_INHERITED_3_10_CONTROL_IDS = [
  "3.10.1",
  "3.10.2",
  "3.10.4",
  "3.10.5",
] as const;

/** Display list for the Cloud hosting card — strict-inherited only. */
export const AZURE_INHERITED_3_10_BASELINE: { controlId: string; title: string }[] = [
  { controlId: "3.10.1", title: "Physical Access Authorizations" },
  { controlId: "3.10.2", title: "Physical Access Control" },
  { controlId: "3.10.4", title: "Physical Access Logs" },
  { controlId: "3.10.5", title: "Physical Access Monitoring" },
];

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
