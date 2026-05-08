/**
 * Server-side data loader: latest IR tabletop bundle + everything an
 * auditor needs to satisfy IR.L2-3.6.1 / 3.6.2 / 3.6.3 from one card.
 *
 * Surfaces on /dashboard/training (since the customer-facing Training
 * app is where IR testing belongs alongside awareness training — both
 * are "people did the thing" evidence).
 *
 * Returns null when the org has never had an exercise. Otherwise returns
 * the latest bundle's full picture: exercise context, participant
 * attestations, dispute window state, vault blob anchor, and the
 * adjudication status of the three IR controls the bundle satisfies.
 */

import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import {
  irExercises,
  irExerciseBundles,
  irExerciseParticipants,
  irParticipantDisputes,
} from "@/db/schema.ir-tabletop";
import { and, desc, eq, inArray } from "drizzle-orm";

export type AttestationBasisKind =
  | "present_in_room"
  | "present_via_video"
  | "present_via_phone";

export interface ParticipantSummary {
  id: string;
  name: string;
  email: string | null;
  role: string;
  organization: string;
  attestationBasis: AttestationBasisKind | null;
  attestationSignedAt: string | null;
  disputeState: "pending" | "confirmed" | "disputed" | "expired" | null;
}

export interface ControlAdjudicationLine {
  controlId: string; // "3.6.1"
  cmmcId: string; // "IR.L2-3.6.1"
  implementationStatus: string;
  adjudicated: boolean;
}

export interface IrTabletopSummary {
  exerciseId: string;
  exerciseName: string;
  methodology: string;
  scenarioTitle: string | null;
  bundleId: string;
  bundleVersion: number;
  bundleState: "provisional" | "sealed" | "rejected";
  bundleSha256: string | null;
  vaultStorageUri: string | null;
  bytesPersisted: boolean;
  executedAt: string | null;
  validThroughAt: string | null;
  attendanceCorroborationKind: string | null;
  attestationBasisCount: number;
  participants: ParticipantSummary[];
  controlLines: ControlAdjudicationLine[];
  /** Days remaining in the 7-day participant dispute window, or null if sealed/past. */
  disputeWindowDaysRemaining: number | null;
  attendanceSealAt: string | null;
}

const IR_CONTROLS: Array<{ short: string; cmmc: string }> = [
  { short: "3.6.1", cmmc: "IR.L2-3.6.1" },
  { short: "3.6.2", cmmc: "IR.L2-3.6.2" },
  { short: "3.6.3", cmmc: "IR.L2-3.6.3" },
];

export async function getIrTabletopSummaryForOrg(
  organizationId: string
): Promise<IrTabletopSummary | null> {
  // Latest bundle for the org, joined to its exercise. Most recent by
  // created_at — the archive timestamp; for a fully-sealed bundle this
  // matches executed_at + dispute window, for a provisional bundle it's
  // the moment the archive was uploaded.
  const [row] = await db
    .select({
      bundleId: irExerciseBundles.id,
      bundleVersion: irExerciseBundles.bundleVersion,
      bundleState: irExerciseBundles.bundleState,
      bundleSha256: irExerciseBundles.bundleSha256,
      vaultStorageUri: irExerciseBundles.vaultStorageUri,
      bytesPersisted: irExerciseBundles.bytesPersisted,
      executedAt: irExerciseBundles.executedAt,
      validThroughAt: irExerciseBundles.validThroughAt,
      attendanceCorroborationKind: irExerciseBundles.attendanceCorroborationKind,
      attestationBasisJson: irExerciseBundles.attestationBasisJson,
      attendanceSealAt: irExerciseBundles.attendanceSealAt,
      exerciseId: irExercises.id,
      exerciseName: irExercises.name,
      methodology: irExercises.methodology,
      scenarioSnapshotJson: irExercises.scenarioSnapshotJson,
    })
    .from(irExerciseBundles)
    .innerJoin(irExercises, eq(irExerciseBundles.exerciseId, irExercises.id))
    .where(eq(irExercises.organizationId, organizationId))
    .orderBy(desc(irExerciseBundles.createdAt))
    .limit(1);

  if (!row) return null;

  // Pull DB participants (FK-enforced) plus the verbatim attestation_basis
  // JSON (which carries the original cuid + role string the validator UI
  // wants to render). We merge them: DB row is canonical for identity,
  // JSON is canonical for the per-bundle attestation context.
  const dbParticipants = await db
    .select({
      id: irExerciseParticipants.id,
      name: irExerciseParticipants.name,
      email: irExerciseParticipants.email,
      role: irExerciseParticipants.role,
      organization: irExerciseParticipants.organization,
    })
    .from(irExerciseParticipants)
    .where(eq(irExerciseParticipants.exerciseId, row.exerciseId));

  const disputes = await db
    .select({
      participantId: irParticipantDisputes.participantId,
      state: irParticipantDisputes.state,
    })
    .from(irParticipantDisputes)
    .where(eq(irParticipantDisputes.bundleId, row.bundleId));

  const disputeByParticipant = new Map<string, ParticipantSummary["disputeState"]>();
  for (const d of disputes) {
    if (d.participantId) {
      disputeByParticipant.set(
        d.participantId,
        d.state as ParticipantSummary["disputeState"]
      );
    }
  }

  // attestation_basis_json is an array of per-attestee entries that came
  // straight from the TrainOS payload. Build a lookup from there so the
  // card can render the basis (in_room / via_video / via_phone) and the
  // signed_at timestamp without adding more FK rows.
  type BasisJsonEntry = {
    participantId: string | null;
    participantName: string;
    participantEmail: string | null;
    participantRole: string | null;
    attestationBasis: AttestationBasisKind;
    signedAt: string;
  };
  const basisJson = (row.attestationBasisJson ?? []) as unknown as BasisJsonEntry[];
  const basisByParticipant = new Map<string, BasisJsonEntry>();
  for (const b of basisJson) {
    if (b.participantId) basisByParticipant.set(b.participantId, b);
  }

  const participants: ParticipantSummary[] = dbParticipants.map((p) => {
    const basis = basisByParticipant.get(p.id);
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      organization: p.organization,
      attestationBasis: basis?.attestationBasis ?? null,
      attestationSignedAt: basis?.signedAt ?? null,
      disputeState: disputeByParticipant.get(p.id) ?? null,
    };
  });

  // IR control adjudication lines — let the customer see the cause-effect
  // between "exercise was tested + sealed" and "control flips to
  // implemented" per the bin-specific adjudication rule.
  const ctrlIds = IR_CONTROLS.map((c) => c.short);
  const ctrlRecs = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, organizationId),
        inArray(controlRecords.controlId, ctrlIds)
      )
    );
  const recByControl = new Map(ctrlRecs.map((r) => [r.controlId, r]));
  const ADJUDICATED_STATUSES = new Set([
    "implemented",
    "assessed",
    "inherited",
    "not_applicable",
  ]);
  const controlLines: ControlAdjudicationLine[] = IR_CONTROLS.map((c) => {
    const rec = recByControl.get(c.short);
    return {
      controlId: c.short,
      cmmcId: c.cmmc,
      implementationStatus: rec?.implementationStatus ?? "not_started",
      adjudicated: rec ? ADJUDICATED_STATUSES.has(rec.implementationStatus) : false,
    };
  });

  // Dispute window — provisional → sealed at attendance_seal_at (= executed
  // + 7d). Show days remaining when still in the window. Past sealAt or in
  // sealed state → null (no countdown needed).
  const now = Date.now();
  let disputeWindowDaysRemaining: number | null = null;
  if (
    row.bundleState === "provisional" &&
    row.attendanceSealAt &&
    row.attendanceSealAt.getTime() > now
  ) {
    disputeWindowDaysRemaining = Math.ceil(
      (row.attendanceSealAt.getTime() - now) / 86_400_000
    );
  }

  const scenarioSnapshot = (row.scenarioSnapshotJson ?? null) as
    | { title?: string }
    | null;
  const scenarioTitle = scenarioSnapshot?.title ?? null;

  return {
    exerciseId: row.exerciseId,
    exerciseName: row.exerciseName,
    methodology: row.methodology,
    scenarioTitle,
    bundleId: row.bundleId,
    bundleVersion: row.bundleVersion,
    bundleState: (row.bundleState ?? "provisional") as IrTabletopSummary["bundleState"],
    bundleSha256: row.bundleSha256,
    vaultStorageUri: row.vaultStorageUri,
    bytesPersisted: row.bytesPersisted,
    executedAt: row.executedAt?.toISOString() ?? null,
    validThroughAt: row.validThroughAt?.toISOString() ?? null,
    attendanceCorroborationKind: row.attendanceCorroborationKind,
    attestationBasisCount: basisJson.length,
    participants,
    controlLines,
    disputeWindowDaysRemaining,
    attendanceSealAt: row.attendanceSealAt?.toISOString() ?? null,
  };
}
