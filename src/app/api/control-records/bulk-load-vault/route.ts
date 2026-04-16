import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { VAULT_CONTROL_MAP } from "@/data/vault-control-map";
import vaultNarratives from "@/data/cmmc/vault-narratives.json";

const NARRATIVES = vaultNarratives as Record<string, string>;

// ── Vault-to-implementation-status mapping ───────────────────────────────────

const VAULT_TIER_MAP = new Map(
  VAULT_CONTROL_MAP.map((v) => [v.controlId, v.tier])
);

function vaultTierToStatus(controlId: string): string {
  const tier = VAULT_TIER_MAP.get(controlId);
  if (tier === "azure_inherited") return "inherited";
  if (tier === "not_applicable") return "not_applicable";
  return "in_progress"; // shared / customer_managed → needs user review
}

/**
 * POST /api/control-records/bulk-load-vault
 *
 * For every control record with no governance narrative, pre-populate with
 * the comprehensive MacTech Vault narrative (drawn from vault-control-map,
 * SCTM onboarding data, control intelligence, OS evidence manifest,
 * governance matrix, and assessor interrogation data).
 *
 * Also sets implementation status based on vault tier for un-started controls.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const records = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        governanceNarrative: controlRecords.governanceNarrative,
        implementationStatus: controlRecords.implementationStatus,
      })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));

    const now = new Date();
    let updated = 0;

    for (const rec of records) {
      // Skip records that already have a narrative
      if (rec.governanceNarrative && rec.governanceNarrative.trim().length > 0) continue;

      const raw = NARRATIVES[rec.controlId];
      if (!raw) continue;

      // JSON stores \\n as literal — convert to real newlines
      const narrative = raw.replace(/\\n/g, "\n");

      const newStatus = vaultTierToStatus(rec.controlId);
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
        changedById: user.id!,
        fieldName: "governanceNarrative",
        oldValue: null,
        newValue: "[Vault narrative loaded — comprehensive]",
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
