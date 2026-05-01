/**
 * Shared helper: compute per-bucket "still open" counts for an org's
 * outstanding controls.
 *
 * Used by:
 *   - PathTo110Widget on /dashboard (effort-tier breakdown chips)
 *   - /dashboard/readiness/outstanding wizard page (totals + sort order)
 *
 * Single source of truth for "is this control closed?" so the dashboard chip
 * count and the wizard card count never disagree. Honest control adjudication:
 * a control is "closed" only when its actual lane evidence is on file —
 * disposition defaults alone don't count.
 */
import { db } from "@/db";
import {
  controlRecords,
  governanceArtifactCompletions,
  governanceRegisterEntries,
  governanceRegisters,
  irExerciseBundles,
  irExerciseControls,
  irExercises,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  OUTSTANDING_36_CONTROL_IDS,
  OUTSTANDING_CLOSE_PATHS,
  type OutstandingBucket,
} from "./outstanding-controls";

export type LiveStatus = "closed" | "in_progress" | "not_started";

export interface BucketCounts {
  /** Bucket → total in the snapshot (size of the bucket). */
  total: Record<OutstandingBucket, number>;
  /** Bucket → how many are still open (not closed). Drives the widget chips. */
  open: Record<OutstandingBucket, number>;
  /** Bucket → how many are closed. */
  closed: Record<OutstandingBucket, number>;
  /** Total open across all buckets (dynamic count of cards still to do). */
  openAll: number;
  /** Total closed across all buckets (cards visibly Done). */
  closedAll: number;
  /** Per-control liveStatus map (used by the wizard for sort/display). */
  perControl: Map<string, LiveStatus>;
}

/**
 * Compute per-bucket open counts for the org. One DB pass — reused by widget
 * + wizard page, so they always show consistent numbers.
 */
export async function computeOutstandingBucketCounts(orgId: string): Promise<BucketCounts> {
  // Initialize tallies
  const total: Record<OutstandingBucket, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const closed: Record<OutstandingBucket, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const perControl = new Map<string, LiveStatus>();

  for (const cid of OUTSTANDING_36_CONTROL_IDS) {
    const entry = OUTSTANDING_CLOSE_PATHS.get(cid);
    if (entry) total[entry.bucket]++;
  }

  // ── Pull all data needed to evaluate liveStatus for the 36 ──────────────
  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        inArray(controlRecords.controlId, [...OUTSTANDING_36_CONTROL_IDS])
      )
    );

  const recordByControlId = new Map(records.map((r) => [r.controlId, r]));
  const recordIds = records.map((r) => r.id);

  const completions =
    recordIds.length > 0
      ? await db
          .select({
            controlRecordId: governanceArtifactCompletions.controlRecordId,
            artifactLabel: governanceArtifactCompletions.artifactLabel,
            artifactType: governanceArtifactCompletions.artifactType,
          })
          .from(governanceArtifactCompletions)
          .where(
            and(
              eq(governanceArtifactCompletions.organizationId, orgId),
              inArray(governanceArtifactCompletions.controlRecordId, recordIds)
            )
          )
      : [];
  const completionsByRecordId = new Map<string, typeof completions>();
  for (const c of completions) {
    const arr = completionsByRecordId.get(c.controlRecordId) ?? [];
    arr.push(c);
    completionsByRecordId.set(c.controlRecordId, arr);
  }

  // Register final-entry counts (for Bucket A's training_completion / incident_log
  // and every Bucket B's registerSchemaId)
  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const registerIdByKey = new Map(orgRegisters.map((r) => [r.registerKey, r.id]));

  const finalCounts = new Map<string, number>();
  if (orgRegisters.length > 0) {
    const entries = await db
      .select({
        registerId: governanceRegisterEntries.registerId,
        status: governanceRegisterEntries.status,
      })
      .from(governanceRegisterEntries)
      .where(
        inArray(
          governanceRegisterEntries.registerId,
          orgRegisters.map((r) => r.id)
        )
      );
    for (const e of entries) {
      if (e.status !== "final") continue;
      const key = orgRegisters.find((r) => r.id === e.registerId)?.registerKey;
      if (!key) continue;
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + 1);
    }
  }

  // IR tabletop bundles — recent (12 months) per control
  const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - TWELVE_MONTHS_MS);
  const irBundleControls = await db
    .select({
      controlId: irExerciseControls.controlId,
      timestampedAt: irExerciseBundles.timestampedAt,
    })
    .from(irExerciseBundles)
    .innerJoin(
      irExercises,
      and(
        eq(irExerciseBundles.exerciseId, irExercises.id),
        eq(irExercises.organizationId, orgId)
      )
    )
    .innerJoin(
      irExerciseControls,
      eq(irExerciseControls.exerciseId, irExercises.id)
    );
  const recentIrBundleControls = new Set<string>();
  for (const row of irBundleControls) {
    if (row.timestampedAt && new Date(row.timestampedAt) >= cutoff) {
      recentIrBundleControls.add(row.controlId);
    }
  }

  // ── Evaluate per-control liveStatus ─────────────────────────────────────
  for (const cid of OUTSTANDING_36_CONTROL_IDS) {
    const entry = OUTSTANDING_CLOSE_PATHS.get(cid);
    if (!entry) continue;

    const record = recordByControlId.get(cid);
    let status: LiveStatus = "not_started";

    if (!record) {
      status = "not_started";
    } else if (
      (entry.bucket === "E" || entry.bucket === "C") &&
      entry.attestationTemplateId
    ) {
      const cs = completionsByRecordId.get(record.id) ?? [];
      const has = cs.some(
        (c) =>
          c.artifactType === "ATTESTATION" &&
          c.artifactLabel === entry.attestationTemplateId
      );
      status = has ? "closed" : "not_started";
    } else if (entry.bucket === "B" && entry.registerSchemaId) {
      const count = finalCounts.get(entry.registerSchemaId) ?? 0;
      if (count > 0) status = "closed";
      else if (registerIdByKey.has(entry.registerSchemaId)) status = "in_progress";
      else status = "not_started";
    } else if (entry.bucket === "A") {
      if (cid.startsWith("3.6.")) {
        if (recentIrBundleControls.has(cid)) status = "closed";
        else if (irBundleControls.some((b) => b.controlId === cid))
          status = "in_progress";
        else status = "not_started";
      } else if (cid.startsWith("3.2.")) {
        const count = finalCounts.get("training_completion") ?? 0;
        if (count > 0) status = "closed";
        else if (registerIdByKey.has("training_completion")) status = "in_progress";
        else status = "not_started";
      }
    }

    perControl.set(cid, status);
    if (status === "closed") closed[entry.bucket]++;
  }

  // Open = total - closed (per bucket)
  const open: Record<OutstandingBucket, number> = {
    A: total.A - closed.A,
    B: total.B - closed.B,
    C: total.C - closed.C,
    D: total.D - closed.D,
    E: total.E - closed.E,
  };

  const openAll = open.A + open.B + open.C + open.D + open.E;
  const closedAll = closed.A + closed.B + closed.C + closed.D + closed.E;

  return { total, open, closed, openAll, closedAll, perControl };
}
