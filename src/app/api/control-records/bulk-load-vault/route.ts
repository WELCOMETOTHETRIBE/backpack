import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { VAULT_CONTROL_MAP, type VaultControl } from "@/data/vault-control-map";

// ── Build a pre-populated narrative from vault metadata ──────────────────────

function buildVaultNarrative(vc: VaultControl): string {
  const lines: string[] = [];

  if (vc.tier === "azure_inherited") {
    lines.push("This control is fully inherited from the Azure Government FedRAMP High authorization.");
  } else if (vc.tier === "not_applicable") {
    lines.push(`This control is not applicable to the current system boundary.${vc.naJustification ? ` Justification: ${vc.naJustification}` : ""}`);
  } else if (vc.tier === "shared") {
    lines.push("This control is implemented under a shared responsibility model between MacTech (platform provider) and the organization.");
  } else if (vc.tier === "customer_managed") {
    lines.push("This control is customer-managed. The organization is responsible for full implementation.");
  }

  if (vc.mactechProvides?.length) {
    lines.push("");
    lines.push("MacTech Vault provides: " + vc.mactechProvides.join("; ") + ".");
  }

  if (vc.azureProvides?.length) {
    lines.push("");
    lines.push("Azure Government provides: " + vc.azureProvides.join("; ") + ".");
  }

  if (vc.technicalCoverage && vc.technicalCoverage !== "NONE") {
    lines.push("");
    const coverageDesc =
      vc.technicalCoverage === "STRONG" ? "Full technical evidence is collected by the OS Evidence Collector." :
      vc.technicalCoverage === "PARTIAL" ? "Partial technical evidence is collected by the OS Evidence Collector; additional governance documentation is required." :
      "This control requires governance documentation only (no automated technical evidence collection).";
    lines.push(coverageDesc);
  }

  if (vc.customerRequired?.length) {
    lines.push("");
    lines.push("Organization responsibilities: " + vc.customerRequired.join("; ") + ".");
  }

  if (vc.governanceDocIds?.length) {
    lines.push("");
    lines.push("Required governance documents: " + vc.governanceDocIds.join(", ") + ".");
  }

  if (vc.evidenceRegisters?.length) {
    lines.push("");
    lines.push("Mapped evidence registers: " + vc.evidenceRegisters.join(", ") + ".");
  }

  return lines.join("\n");
}

// ── Vault-to-implementation-status mapping ───────────────────────────────────

function vaultTierToStatus(vc: VaultControl): string {
  if (vc.tier === "azure_inherited") return "inherited";
  if (vc.tier === "not_applicable") return "not_applicable";
  return "in_progress"; // shared / customer_managed → needs user review
}

/**
 * POST /api/control-records/bulk-load-vault
 *
 * For every control record with no governance narrative, pre-populate with
 * the MacTech Vault narrative and set the implementation status based on tier.
 * Only touches controls that have NOT already been adjudicated by the user.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const records = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId, governanceNarrative: controlRecords.governanceNarrative, implementationStatus: controlRecords.implementationStatus })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));

    const vaultMap = new Map(VAULT_CONTROL_MAP.map((v) => [v.controlId, v]));
    const now = new Date();
    let updated = 0;

    for (const rec of records) {
      // Skip records that already have a narrative
      if (rec.governanceNarrative && rec.governanceNarrative.trim().length > 0) continue;

      const vc = vaultMap.get(rec.controlId);
      if (!vc) continue;

      const narrative = buildVaultNarrative(vc);
      if (!narrative) continue;

      const newStatus = vaultTierToStatus(vc);
      const shouldUpdateStatus = rec.implementationStatus === "not_started";

      const updates: Record<string, unknown> = {
        governanceNarrative: narrative,
        updatedAt: now,
      };
      if (shouldUpdateStatus) {
        updates.implementationStatus = newStatus;
      }

      await db.update(controlRecords).set(updates).where(eq(controlRecords.id, rec.id));

      // Audit trail
      await db.insert(controlRecordHistory).values({
        controlRecordId: rec.id,
        changedById: user.id,
        fieldName: "governanceNarrative",
        oldValue: null,
        newValue: "[Vault narrative loaded]",
      });

      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: records.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load vault narratives";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
