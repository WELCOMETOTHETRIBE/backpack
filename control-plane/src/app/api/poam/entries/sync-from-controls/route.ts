import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamEntries, controlRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * POST /api/poam/entries/sync-from-controls
 * Creates POA&M entries for all control records that are currently not_started or in_progress
 * and do not already have an entry. Called on command from the POA&M dashboard.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const incompleteRecords = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          inArray(controlRecords.implementationStatus, ["not_started", "in_progress"])
        )
      );

    const existingEntryRecordIds = await db
      .select({ controlRecordId: poamEntries.controlRecordId })
      .from(poamEntries)
      .where(eq(poamEntries.organizationId, orgId));

    const existingSet = new Set(existingEntryRecordIds.map((r) => r.controlRecordId));
    const toCreate = incompleteRecords.filter((r) => !existingSet.has(r.id));

    const ids: string[] = [];
    for (const { id: controlRecordId } of toCreate) {
      const [inserted] = await db
        .insert(poamEntries)
        .values({
          organizationId: orgId,
          controlRecordId,
          weaknessDescription: null,
          remediationPlan: null,
          scheduledCompletionDate: null,
          responsibleRoleId: null,
        })
        .returning({ id: poamEntries.id });
      if (inserted?.id) ids.push(inserted.id);
    }

    return NextResponse.json({ created: ids.length, ids });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
