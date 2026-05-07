/**
 * Apply an accepted TrainOS evidence delivery to Codex's control records.
 *
 * Per the integration brief response (proactive item #2):
 *   - For each unique controlId in the canonical evidence:
 *     1. Find the org's training_completion register; create if missing.
 *     2. Insert a `governance_register_entries` row with status="final"
 *        carrying the canonical evidence + delivery metadata in entryData.
 *     3. Insert an `attestations` row pointing at the verificationUrl IF a
 *        Codex user matches the learnerEmail (lower-cased, org-scoped).
 *        If no match, the register entry alone is sufficient evidence —
 *        the canonical JSON is self-contained for the assessor.
 *     4. Re-run calculateControlStatus() for each affected control.
 *
 * Everything happens in a single transaction so a partial failure doesn't
 * leave half-applied evidence behind. Same posture as the ISSO export
 * dispatcher's per-section handler model.
 *
 * Audit log row is written by the caller (route handler) AFTER the
 * transaction commits, so we don't surface a phantom event if the
 * transaction rolls back.
 */

import { db } from "@/db";
import {
  attestations,
  boundaries,
  controlRecords,
  governanceRegisterEntries,
  governanceRegisters,
  trainingRecords,
  users,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { calculateControlStatus } from "@/lib/control-status";
import { controlIdToNist } from "@/lib/compliance/controlId";
import type {
  PerObjectiveVerdict,
  TrainosAttemptCompletedEvent,
  TrainosCanonicalEvidence,
  TrainosCertificateRef,
} from "./types";

const TRAINING_COMPLETION_REGISTER_KEY = "training_completion";

export interface ApplyEvidenceArgs {
  organizationId: string;
  event: TrainosAttemptCompletedEvent;
  perObjective: PerObjectiveVerdict[];
  /** Hex sha256 of canonical(canonical) we already verified matches event.evidence.evidenceHash. */
  evidenceHashHex: string;
}

export interface ApplyEvidenceResult {
  controlsTouched: string[]; // NIST short ids, e.g. "3.2.1"
  registerEntriesCreated: number;
  attestationsCreated: number;
  recalcErrors: string[];
}

/**
 * Apply the evidence side-effects. Caller decides whether to apply at all
 * (typically: only when overall verdict is ACCEPTED or ACCEPTED_WITH_NOTES).
 * Returns a summary the route handler attaches to the audit log.
 */
export async function applyTrainosEvidence(
  args: ApplyEvidenceArgs
): Promise<ApplyEvidenceResult> {
  const { organizationId, event, perObjective, evidenceHashHex } = args;
  const canonical = event.evidence.canonical;
  const certificate = event.certificate ?? null;

  // Unique NIST short ids touched by this evidence (e.g. "3.2.1" not "AT.L2-3.2.1").
  // The caller applies this to control_records, which are keyed by short id.
  const acceptedObjectivesByNistId = new Map<string, PerObjectiveVerdict[]>();
  for (const v of perObjective) {
    if (v.verdict === "INSUFFICIENT" || v.verdict === "REJECTED") continue;
    const nist = controlIdToNist(v.controlId);
    const arr = acceptedObjectivesByNistId.get(nist) ?? [];
    arr.push(v);
    acceptedObjectivesByNistId.set(nist, arr);
  }
  const nistControlIds = [...acceptedObjectivesByNistId.keys()];
  if (nistControlIds.length === 0) {
    return {
      controlsTouched: [],
      registerEntriesCreated: 0,
      attestationsCreated: 0,
      recalcErrors: [],
    };
  }

  let registerEntriesCreated = 0;
  let attestationsCreated = 0;

  await db.transaction(async (tx) => {
    // 1. Find or create the training_completion register for this org.
    let registerId: string;
    const [existingRegister] = await tx
      .select({ id: governanceRegisters.id })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, organizationId),
          eq(governanceRegisters.registerKey, TRAINING_COMPLETION_REGISTER_KEY)
        )
      )
      .limit(1);
    if (existingRegister) {
      registerId = existingRegister.id;
    } else {
      const [created] = await tx
        .insert(governanceRegisters)
        .values({
          organizationId,
          registerKey: TRAINING_COMPLETION_REGISTER_KEY,
          name: "Training Completion",
          description:
            "Training course completions ingested from TrainOS. Each entry represents one learner finishing one course version with the canonical evidence record + verification URL.",
          defaultCadenceDays: 365,
          controlIds: nistControlIds,
        })
        .returning({ id: governanceRegisters.id });
      registerId = created.id;
    }

    // 2. Pick a boundary for the entry. Register entries require boundaryId;
    // for an org-wide training event we use the org's first boundary. If
    // the org has no boundary yet (pre-onboarding), skip the entry — the
    // route handler will return INSUFFICIENT for "no scoped boundary" once
    // we surface that path. For now: take the first boundary or bail.
    const [firstBoundary] = await tx
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, organizationId))
      .limit(1);
    if (!firstBoundary) {
      throw new Error(
        "organization has no boundary configured — cannot anchor training_completion register entry"
      );
    }

    // 3. Match the learner against a Codex user (org-scoped, case-insensitive
    // email). nullable — if no match, attestation is skipped per brief.
    const [matchedUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          sql`lower(${users.email}) = lower(${canonical.learnerEmail})`
        )
      )
      .limit(1);

    // 4. Create the register entry. entryData carries everything an auditor
    // needs to reconstruct the evidence chain: TrainOS delivery metadata,
    // the canonical evidence record verbatim, the verdict, and the
    // verification URL.
    const entryData: Record<string, unknown> = {
      source: "trainos",
      delivery_id: event.deliveryId,
      evidence_record_id: event.evidence.evidenceRecordId,
      evidence_hash: evidenceHashHex,
      ledger_sequence: event.evidence.ledger.sequenceNumber,
      ledger_current_hash: event.evidence.ledger.currentEntryHash,
      canonicalization_version: event.evidence.canonicalizationVersion,
      occurred_at: event.occurredAt,
      learner: {
        id: canonical.learnerId,
        name: canonical.learnerName,
        email: canonical.learnerEmail,
        role: canonical.learnerRole,
        codex_user_id: matchedUser?.id ?? null,
      },
      course: {
        id: canonical.courseId,
        title: canonical.courseTitle,
        version: canonical.courseVersion,
        effective_date: canonical.courseEffectiveDate,
        content_hash: canonical.courseContentHash,
      },
      assessment: {
        attempt_id: canonical.attemptId,
        attempt_number: canonical.attemptNumber,
        score: canonical.score,
        passing_threshold: canonical.passingThreshold,
        passed: canonical.passed,
        modules_completed: canonical.modulesCompleted,
      },
      acknowledgement: canonical.acknowledgement,
      certificate: certificate
        ? {
            number: certificate.certificateNumber,
            hash: certificate.certificateHash,
            verification_url: certificate.verificationUrl,
          }
        : null,
      objectives_satisfied: perObjective
        .filter((v) => v.verdict === "ACCEPTED" || v.verdict === "ACCEPTED_WITH_NOTES")
        .map((v) => ({
          control_id: v.controlId,
          objective: v.objective,
          verdict: v.verdict,
          remediation: v.remediation ?? null,
        })),
      completed_at: canonical.completedAt,
    };

    const [createdEntry] = await tx
      .insert(governanceRegisterEntries)
      .values({
        registerId,
        boundaryId: firstBoundary.id,
        entryType: "training_completion",
        status: "final",
        finalizedAt: new Date(),
        entryData,
        approvedById: matchedUser?.id ?? null,
        createdById: matchedUser?.id ?? null,
        exportable: true,
      })
      .returning({ id: governanceRegisterEntries.id });
    registerEntriesCreated = 1;

    // 5. Per-control attestations (only if we matched a Codex user — otherwise
    // the register entry above is the assessor-defensible record).
    if (matchedUser) {
      // Find affected control_records to write attestations against.
      const affectedRecords = await tx
        .select({ id: controlRecords.id, controlId: controlRecords.controlId })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, organizationId),
            inArray(controlRecords.controlId, nistControlIds)
          )
        );

      for (const rec of affectedRecords) {
        await tx.insert(attestations).values({
          organizationId,
          attestationType: "control_attestation",
          resourceType: "control_record",
          resourceId: rec.id,
          signatoryId: matchedUser.id,
          dataHash: evidenceHashHex,
          comment: `TrainOS training completion: ${canonical.courseTitle} v${canonical.courseVersion} — score ${canonical.score}/${canonical.passingThreshold}. Verification: ${certificate?.verificationUrl ?? "(none)"}`,
        });
        attestationsCreated++;
      }

      void createdEntry; // already consumed
    }

    // 6. Mirror into the legacy training_records table so /dashboard/training
    // (and the 50+ other call sites that read from it) see TrainOS-sourced
    // completions alongside hand-entered ones. The register entry above is
    // the system-of-record for evidence; this row is just the operational
    // view the rest of Codex already knows how to read.
    const completedAtIso = canonical.completedAt; // ISO 8601 string
    const completedAtDate = completedAtIso.slice(0, 10); // YYYY-MM-DD
    const expiresAtMs =
      new Date(completedAtIso).getTime() + 365 * 24 * 60 * 60 * 1000;
    const expiresAtDate = new Date(expiresAtMs).toISOString().slice(0, 10);
    // training_records.training_type is single-valued and the
    // /dashboard/training Boundary Compliance widget renders one column
    // per type (3.2.1 awareness / 3.2.2 role-based / 3.2.3 insider threat).
    // A course like AT-001 covers BOTH 3.2.1 and 3.2.3 — insert one row
    // per covered control so all relevant columns mark complete. Each
    // row points back to the same canonical evidence + cert, so this is
    // a denormalized projection of the single underlying completion.
    //
    const trainingTypeByNistId: Record<string, string> = {
      "3.2.1": "security_awareness",
      "3.2.2": "role_based",
      "3.2.3": "insider_threat",
    };
    // Map TrainOS OfficialRole (LEARNER, ISSO, …) onto the Codex
    // user_role taxonomy used by the in-app form (TrainingClient.tsx
    // USER_ROLES). The audience pill in the Training register reads
    // these snake_case values; the Boundary Compliance widget keys
    // off users.cui_access_level instead, so mismatches are cosmetic.
    const TRAINOS_TO_CODEX_ROLE: Record<string, string> = {
      LEARNER: "all_users",
      MANAGER: "manager",
      ADMIN: "system_administrator",
      ISSO: "security_officer",
      INCIDENT_RESPONDER: "privileged_user",
      EVIDENCE_OWNER: "privileged_user",
      ASSESSOR: "privileged_user",
    };
    const learnerRoleRaw = canonical.learnerRole ?? "";
    const codexUserRole =
      TRAINOS_TO_CODEX_ROLE[learnerRoleRaw] ?? "all_users";
    const baseRow = {
      organizationId,
      personnelName: canonical.learnerName,
      personnelEmail: canonical.learnerEmail,
      courseTitle: canonical.courseTitle,
      deliveryMethod: "online",
      completedAt: completedAtDate,
      expiresAt: expiresAtDate,
      userRole: codexUserRole,
      evidenceUrl: certificate?.verificationUrl ?? null,
      notes: `TrainOS delivery ${event.deliveryId} · evidence ${event.evidence.evidenceRecordId} · score ${canonical.score}/${canonical.passingThreshold} · learner role ${learnerRoleRaw}`,
      createdById: matchedUser?.id ?? null,
    };
    const rowsToInsert = nistControlIds
      .filter((id) => trainingTypeByNistId[id])
      .map((id) => ({ ...baseRow, trainingType: trainingTypeByNistId[id]! }));
    // Fallback: if none of the controlIds map to a known type, still
    // record one row as "other" so the completion is visible.
    if (rowsToInsert.length === 0) {
      rowsToInsert.push({ ...baseRow, trainingType: "other" });
    }
    await tx.insert(trainingRecords).values(rowsToInsert);
  });

  // 6. Recalculate control_records status for affected controls. Best-effort
  // per-control: a single failure shouldn't roll back the ingest.
  const affectedRecords = await db
    .select({ id: controlRecords.id, controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, organizationId),
        inArray(controlRecords.controlId, nistControlIds)
      )
    );

  const recalcErrors: string[] = [];
  for (const rec of affectedRecords) {
    try {
      await calculateControlStatus(rec.id);
    } catch (e) {
      recalcErrors.push(
        `${rec.controlId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return {
    controlsTouched: nistControlIds,
    registerEntriesCreated,
    attestationsCreated,
    recalcErrors,
  };
}

/** Re-export for the route module so it doesn't have to import the const directly. */
export { TRAINING_COMPLETION_REGISTER_KEY };

/** Unused alias retained for type checks against the certificate ref. */
export type _CertRef = TrainosCertificateRef;
/** Unused alias retained for type checks against the canonical evidence shape. */
export type _CanonicalRef = TrainosCanonicalEvidence;
