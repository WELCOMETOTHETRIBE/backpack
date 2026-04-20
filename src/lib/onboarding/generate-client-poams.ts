import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  controlRecords,
  controls,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  POAM_ELIGIBLE_CONTROLS,
  type ClientArtifactMilestone,
  type ControlClientArtifacts,
} from "@/data/cmmc/client-required-artifacts";
import { createPlaceholderArtifact } from "@/lib/artifacts/placeholder";
import { refreshPlaceholderMetadata } from "@/lib/artifacts/backfill";

export type GenerateClientPoamsResult = {
  created: number;
  skipped: number;
  totalMilestones: number;
  placeholdersCreated: number;
  placeholdersRefreshed: number;
};

const CLOSURE_LABEL: Record<ClientArtifactMilestone["closureType"], string> = {
  upload: "UPLOAD",
  attestation: "ATTESTATION",
  register_pointer: "REGISTER",
  system_pointer: "SYSTEM",
};

/** ISO date (YYYY-MM-DD) `offsetDays` from now. */
function dueDateFromOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Short metadata suffix appended to the milestone title so the existing flat
 *  schema still surfaces closure type / evidence type / cadence to the user. */
function titleWithSuffix(m: ClientArtifactMilestone): string {
  const closure = CLOSURE_LABEL[m.closureType];
  return `${m.title}  ·  ${closure} · ${m.evidenceType} · ${m.cadence}`;
}

function buildWeaknessDescription(
  entry: ControlClientArtifacts,
  controlTitle: string | null
): string {
  const header = `${controlTitle ?? "Control"} (NIST ${entry.controlId}) — ${entry.weaknessSummary}`;
  const bullets = entry.milestones.map((m) => `  - ${m.title}`).join("\n");
  return `${header}\n\nClient-required artifacts pending:\n${bullets}`;
}

function buildRemediationPlan(entry: ControlClientArtifacts): string {
  const numbered = entry.milestones
    .map((m, i) => {
      const meta = [
        `closure: ${m.closureType}`,
        `evidence: ${m.evidenceType}`,
        `cadence: ${m.cadence}`,
        `due in ${m.dueOffsetDays} days`,
        m.registerKey ? `register: ${m.registerKey}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${i + 1}. ${m.title}\n   ${m.description}\n   (${meta})`;
    })
    .join("\n\n");

  const footer =
    "\n\nClose each milestone by uploading the required artifact to Governance > Evidence, by finalizing the referenced register, or by submitting the signed attestation. MacTech delivers the technical OS/Cloud evidence and governing Policies & Procedures; everything enumerated above is the client's responsibility.";

  return `Remediate the following client-required artifacts to bring NIST ${entry.controlId} to "implemented":\n\n${numbered}${footer}`;
}

/**
 * Auto-generate one open POA&M entry per control that has client-required
 * artifacts, with milestones for every deliverable. Idempotent: skips any
 * control that already has an open POAM for the same controlRecord.
 */
export async function generateClientRequiredPoams(
  orgId: string
): Promise<GenerateClientPoamsResult> {
  // 1. Load this org's controlRecords joined to control titles.
  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      controlTitle: controls.title,
    })
    .from(controlRecords)
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(eq(controlRecords.organizationId, orgId));

  const recordByControlId = new Map(records.map((r) => [r.controlId, r]));

  // 2. Load existing open POAMs so we don't duplicate.
  const existing = await db
    .select({ controlRecordId: poamEntries.controlRecordId })
    .from(poamEntries)
    .where(
      and(eq(poamEntries.organizationId, orgId), eq(poamEntries.status, "open"))
    );
  const existingOpenControlRecordIds = new Set(
    existing.map((e) => e.controlRecordId)
  );

  let created = 0;
  let skipped = 0;
  let totalMilestones = 0;
  let placeholdersCreated = 0;

  // 3. Walk the catalog.
  for (const entry of POAM_ELIGIBLE_CONTROLS) {
    const record = recordByControlId.get(entry.controlId);
    if (!record) {
      // Control record not seeded for this org — the onboarding route seeds
      // all 110 before calling us, so this only happens if upstream skipped.
      skipped++;
      continue;
    }
    if (existingOpenControlRecordIds.has(record.id)) {
      skipped++;
      continue;
    }

    const scheduled = dueDateFromOffset(
      Math.max(...entry.milestones.map((m) => m.dueOffsetDays))
    );

    const [inserted] = await db
      .insert(poamEntries)
      .values({
        organizationId: orgId,
        controlRecordId: record.id,
        weaknessDescription: buildWeaknessDescription(entry, record.controlTitle),
        remediationPlan: buildRemediationPlan(entry),
        scheduledCompletionDate: scheduled,
      })
      .returning({ id: poamEntries.id });

    for (let i = 0; i < entry.milestones.length; i++) {
      const m = entry.milestones[i];
      const [insertedMilestone] = await db
        .insert(poamEntryMilestones)
        .values({
          poamEntryId: inserted.id,
          title: titleWithSuffix(m),
          dueDate: dueDateFromOffset(m.dueOffsetDays),
          orderIndex: i,
        })
        .returning({ id: poamEntryMilestones.id });
      totalMilestones++;

      // Seed an awaiting_upload placeholder artifact so the Artifacts page
      // has a concrete row for the user to fill.
      await createPlaceholderArtifact({
        orgId,
        controlRecordId: record.id,
        milestone: m,
        poamMilestoneId: insertedMilestone.id,
      });
      placeholdersCreated++;
    }

    created++;
  }

  // Align pre-existing placeholders with the current catalog. Safe to run
  // even when no new placeholders were created — idempotent metadata sync.
  const refresh = await refreshPlaceholderMetadata(orgId);

  return {
    created,
    skipped,
    totalMilestones,
    placeholdersCreated,
    placeholdersRefreshed: refresh.updated,
  };
}
