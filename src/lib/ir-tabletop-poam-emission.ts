/**
 * POA&M emission for IR tabletop bundle archives (Codex migration 0065).
 *
 * Two reasons a bundle can produce POA&M entries automatically:
 *
 *   1. AAR captured high/critical findings without closed corrective
 *      actions. The C3PAO rule: "an AAR that finds gaps but doesn't
 *      translate to fixes is a paper exercise." Open findings of
 *      severity ∈ {high, critical} → one POA&M per finding.
 *
 *   2. Org isn't enrolled with DIBNet (irCoverage shows 3.6.2 with
 *      a DIBNet gap). AT.L2-3.6.2 needs a documented reporting path
 *      within 72 hours. POA&M tracks closure with milestones for
 *      enrollment, account credentials, IRP update, and re-run.
 *
 * Idempotent: checks for existing POA&M with the same trigger before
 * inserting (keyed on weaknessDescription + controlRecordId — bundle
 * archive POA&Ms have a stable signature).
 *
 * Caller invokes this AFTER the bundle archive transaction commits, so
 * a POA&M write failure doesn't roll back the archive itself.
 */
import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  controlRecords,
  poamEntries,
  poamEntryMilestones,
} from "@/db/schema"

export type EmittedPoam = {
  poamId: string
  controlId: string
  trigger: "ir_finding" | "dibnet_enrollment_gap"
  weakness: string
}

export type FindingForEmission = {
  id: string
  controlId: string
  severity: string
  title: string
  description: string
  /** Has at least one corrective action with status ∈ {completed, verified}. */
  hasClosedCorrectiveAction: boolean
}

export type EmitArgs = {
  organizationId: string
  exerciseId: string
  bundleId: string
  /** Findings extracted from the bundle's snapshot. */
  findings: FindingForEmission[]
  /** From the bundle's manifest. */
  irCoverage?: Record<string, { satisfied: boolean; gaps: string[] } | undefined>
}

const DIBNET_GAP_MARKER =
  "DIBNet enrollment gap — auto-emitted by IR tabletop bundle archive."
const FINDING_GAP_PREFIX = "IR tabletop finding "

async function getOrCreateControlRecord(
  organizationId: string,
  controlId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, organizationId),
        eq(controlRecords.controlId, controlId),
      ),
    )
    .limit(1)
  if (existing) return existing.id
  const [created] = await db
    .insert(controlRecords)
    .values({ organizationId, controlId })
    .returning({ id: controlRecords.id })
  return created.id
}

export async function emitPoamFromBundle(
  args: EmitArgs,
): Promise<EmittedPoam[]> {
  const emitted: EmittedPoam[] = []

  // ─── 1. High/critical findings without closed corrective actions ──────
  for (const f of args.findings) {
    const severityHigh =
      f.severity.toLowerCase() === "high" ||
      f.severity.toLowerCase() === "critical"
    if (!severityHigh) continue
    if (f.hasClosedCorrectiveAction) continue

    const recordId = await getOrCreateControlRecord(
      args.organizationId,
      f.controlId,
    )
    const weakness = `${FINDING_GAP_PREFIX}${f.id}: ${f.title}`
    // Idempotency: don't re-emit for the same finding.
    const [existing] = await db
      .select({ id: poamEntries.id })
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.organizationId, args.organizationId),
          eq(poamEntries.controlRecordId, recordId),
          eq(poamEntries.weaknessDescription, weakness),
        ),
      )
      .limit(1)
    if (existing) continue

    const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const [poam] = await db
      .insert(poamEntries)
      .values({
        organizationId: args.organizationId,
        controlRecordId: recordId,
        status: "open",
        weaknessDescription: weakness,
        remediationPlan: `${f.description}\n\n(Auto-emitted from IR tabletop bundle ${args.bundleId} — finding had ${f.severity} severity with no closed corrective action at archive time. Update this POA&M with the corrective-action plan and target close date, then close once verified.)`,
        scheduledCompletionDate: ninetyDaysOut.toISOString().slice(0, 10),
      })
      .returning({ id: poamEntries.id })
    emitted.push({
      poamId: poam.id,
      controlId: f.controlId,
      trigger: "ir_finding",
      weakness,
    })
  }

  // ─── 2. DIBNet enrollment gap → POA&M ─────────────────────────────────
  const cov362 = args.irCoverage?.["3.6.2"]
  const dibnetGapDetected =
    cov362 != null &&
    !cov362.satisfied &&
    cov362.gaps.some((g) => /DIBNet/i.test(g))
  if (dibnetGapDetected) {
    const recordId = await getOrCreateControlRecord(
      args.organizationId,
      "3.6.2",
    )
    const [existing] = await db
      .select({ id: poamEntries.id })
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.organizationId, args.organizationId),
          eq(poamEntries.controlRecordId, recordId),
          eq(poamEntries.weaknessDescription, DIBNET_GAP_MARKER),
        ),
      )
      .limit(1)
    if (!existing) {
      const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      const [poam] = await db
        .insert(poamEntries)
        .values({
          organizationId: args.organizationId,
          controlRecordId: recordId,
          status: "open",
          weaknessDescription: DIBNET_GAP_MARKER,
          remediationPlan:
            "Complete DIBNet enrollment: submit registration request, " +
            "receive account credentials + DIBNet ICS-CERT POC, document " +
            "the 72-hour reporting path in the IR Plan, and re-run the IR " +
            "tabletop to demonstrate the new path satisfies AT.L2-3.6.2.",
          scheduledCompletionDate: ninetyDaysOut.toISOString().slice(0, 10),
        })
        .returning({ id: poamEntries.id })
      await db.insert(poamEntryMilestones).values([
        {
          poamEntryId: poam.id,
          title: "Submit DIBNet enrollment request",
          orderIndex: 0,
        },
        {
          poamEntryId: poam.id,
          title: "Receive DIBNet account credentials + ICS-CERT POC",
          orderIndex: 1,
        },
        {
          poamEntryId: poam.id,
          title: "Update IRP with 72-hour reporting workflow",
          orderIndex: 2,
        },
        {
          poamEntryId: poam.id,
          title: "Re-run IR tabletop demonstrating reporting path",
          orderIndex: 3,
        },
      ])
      emitted.push({
        poamId: poam.id,
        controlId: "3.6.2",
        trigger: "dibnet_enrollment_gap",
        weakness: DIBNET_GAP_MARKER,
      })
    }
  }

  return emitted
}
