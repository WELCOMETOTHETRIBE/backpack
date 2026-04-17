import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  controlRecords,
  controls,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { sprsScoringData } from "@/lib/sprs";

/**
 * POST /api/poam/entries/sync-from-controls
 *
 * Smart evidence-driven sync:
 * 1. Finds all control records that are not yet fully implemented.
 * 2. For each, analyses which evidence lanes are unsatisfied (technical, governance, policy, registers).
 * 3. Creates POA&M entries with auto-generated weakness descriptions, remediation plans,
 *    and per-gap milestones. Skips controls that already have an open POA&M entry.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const DONE_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"];

    // 1. Fetch incomplete control records with control metadata
    const incompleteRecords = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        technicalStatus: controlRecords.technicalStatus,
        policyDocRequired: controlRecords.policyDocRequired,
        policyStatus: controlRecords.policyStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        technicalNarrative: controlRecords.technicalNarrative,
        controlTitle: controls.title,
      })
      .from(controlRecords)
      .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          sql`${controlRecords.implementationStatus} NOT IN (${sql.join(
            DONE_STATUSES.map((s) => sql`${s}`),
            sql`, `
          )})`
        )
      );

    if (incompleteRecords.length === 0) {
      return NextResponse.json({ created: 0, updated: 0, message: "All controls are implemented — no POAMs needed." });
    }

    // 2. Fetch existing open POA&M entries
    const existingEntries = await db
      .select({ controlRecordId: poamEntries.controlRecordId, id: poamEntries.id })
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.organizationId, orgId),
          eq(poamEntries.status, "open")
        )
      );
    const existingSet = new Set(existingEntries.map((e) => e.controlRecordId));

    // 3. Load register satisfaction data
    //    - Get all registers with their controlIds mapping
    //    - Count finalized entries per register for this org
    const orgRegisters = await db
      .select({
        id: governanceRegisters.id,
        registerKey: governanceRegisters.registerKey,
        name: governanceRegisters.name,
        controlIds: governanceRegisters.controlIds,
      })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));

    // Get org boundaries for register entry lookup
    const orgBoundaries = await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId));
    const boundaryIds = orgBoundaries.map((b) => b.id);

    // Count finalized register entries per register
    const registerSatisfaction = new Map<string, { name: string; finalCount: number }>();
    if (boundaryIds.length > 0) {
      for (const reg of orgRegisters) {
        const [row] = await db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(
            and(
              eq(governanceRegisterEntries.registerId, reg.id),
              inArray(governanceRegisterEntries.boundaryId, boundaryIds),
              eq(governanceRegisterEntries.status, "final")
            )
          );
        registerSatisfaction.set(reg.id, {
          name: reg.name,
          finalCount: row?.cnt ?? 0,
        });
      }
    }

    // Build controlId → register info map
    const controlRegisterMap = new Map<string, { registerId: string; registerName: string; satisfied: boolean }[]>();
    for (const reg of orgRegisters) {
      const cids = (reg.controlIds ?? []) as string[];
      const sat = registerSatisfaction.get(reg.id);
      for (const cid of cids) {
        if (!controlRegisterMap.has(cid)) controlRegisterMap.set(cid, []);
        controlRegisterMap.get(cid)!.push({
          registerId: reg.id,
          registerName: reg.name,
          satisfied: (sat?.finalCount ?? 0) > 0,
        });
      }
    }

    // 4. Load control intelligence for POAM verbiage
    const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
    const sprsMap = new Map(sprsScoringData.map((c) => [c.id, c.value as number]));

    // 5. Create POA&M entries with smart verbiage
    const createdIds: string[] = [];
    const skipped: string[] = [];
    const scheduledDate = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    for (const rec of incompleteRecords) {
      if (existingSet.has(rec.id)) {
        skipped.push(rec.controlId);
        continue;
      }

      const intel = intelMap.get(rec.controlId);
      const sprs = sprsMap.get(rec.controlId) ?? 0;

      // Analyse what's missing
      const gaps: string[] = [];
      const milestones: string[] = [];

      // Technical lane
      const techStatus = rec.technicalStatus ?? "not_started";
      if (techStatus !== "satisfied") {
        gaps.push("Technical evidence not satisfied");
        if (intel?.evidenceLanes.includes("lane_1_technical")) {
          milestones.push("Collect and upload OS Collector technical evidence");
        }
        if (intel?.evidenceLanes.includes("lane_2_azure")) {
          milestones.push("Verify Azure Government / FedRAMP High inheritance documentation");
        }
        if (!intel?.evidenceLanes.length) {
          milestones.push("Upload technical evidence artifacts for this control");
        }
      }

      // Governance lane
      const hasNarrative = Boolean(rec.governanceNarrative?.trim());
      if (!hasNarrative) {
        gaps.push("Governance narrative not documented");
        milestones.push("Write governance implementation narrative describing how this control is satisfied");
      }

      // Policy document lane (hybrid controls)
      if (rec.policyDocRequired) {
        const polStatus = rec.policyStatus ?? "not_required";
        if (polStatus !== "satisfied") {
          gaps.push("Required policy document not linked");
          milestones.push("Upload or link the required policy/procedure document in the Governance Manifest");
        }
      }

      // Register satisfaction
      const regInfo = controlRegisterMap.get(rec.controlId) ?? [];
      const unsatisfiedRegisters = regInfo.filter((r) => !r.satisfied);
      if (unsatisfiedRegisters.length > 0) {
        for (const ur of unsatisfiedRegisters) {
          gaps.push(`Register "${ur.registerName}" has no finalized entries`);
          milestones.push(`Create and finalize entries in the "${ur.registerName}" register`);
        }
      } else if (intel?.registerRequired && regInfo.length === 0) {
        gaps.push("Required register not configured");
        milestones.push(`Set up the "${intel.registerKey ?? "required"}" register and add entries`);
      }

      // Build POAM verbiage
      const weakness = [
        `${rec.controlTitle} (NIST ${rec.controlId})`,
        `is currently "${rec.implementationStatus}".`,
        sprs > 0 ? `SPRS impact: -${sprs} points.` : "",
        "",
        "Identified gaps:",
        ...gaps.map((g) => `  - ${g}`),
      ]
        .filter(Boolean)
        .join("\n");

      const remediation = [
        `Remediate the following gaps to bring NIST ${rec.controlId} to "implemented" status:`,
        "",
        ...milestones.map((m, i) => `${i + 1}. ${m}`),
        "",
        intel?.c3paoExaminerNote
          ? `C3PAO note: ${intel.c3paoExaminerNote}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Insert POAM entry
      const [inserted] = await db
        .insert(poamEntries)
        .values({
          organizationId: orgId,
          controlRecordId: rec.id,
          weaknessDescription: weakness,
          remediationPlan: remediation,
          scheduledCompletionDate: scheduledDate,
        })
        .returning({ id: poamEntries.id });

      // Insert milestones
      for (let i = 0; i < milestones.length; i++) {
        await db.insert(poamEntryMilestones).values({
          poamEntryId: inserted.id,
          title: milestones[i],
          dueDate: scheduledDate,
          orderIndex: i,
        });
      }

      createdIds.push(inserted.id);
    }

    return NextResponse.json({
      created: createdIds.length,
      skipped: skipped.length,
      message:
        createdIds.length > 0
          ? `Created ${createdIds.length} POA&M entr${createdIds.length === 1 ? "y" : "ies"} with auto-generated verbiage and milestones.`
          : `All incomplete controls already have open POA&M entries (${skipped.length} skipped).`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
