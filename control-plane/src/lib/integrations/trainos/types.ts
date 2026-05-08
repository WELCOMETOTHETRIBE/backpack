/**
 * Shared TypeScript types for the TrainOS → Codex integration.
 *
 * Mirrors the contract in v2-final of the integration brief:
 *   - inbound `evidence.attempt.completed` event envelope
 *   - canonical evidence shape (the `evidence.canonical` subobject)
 *   - per-objective verdict response shape
 *
 * See also docs/specs/trainos-codex-integration-v2.md (when checked in).
 */

export type TrainosVerdict =
  | "ACCEPTED"
  | "ACCEPTED_WITH_NOTES"
  | "INSUFFICIENT"
  | "REJECTED"
  | "IDEMPOTENT_REPLAY";

/** Strictness rank used to compute the overall verdict from per-objective. */
export const VERDICT_STRICTNESS: Record<TrainosVerdict, number> = {
  ACCEPTED: 0,
  ACCEPTED_WITH_NOTES: 1,
  INSUFFICIENT: 2,
  REJECTED: 3,
  // Replay verdicts are returned verbatim from cache and shouldn't participate
  // in the strictness fold; we never compute them. Same rank as ACCEPTED.
  IDEMPOTENT_REPLAY: 0,
};

export interface TrainosControlMapping {
  controlId: string; // e.g. "AT.L2-3.2.1"
  objective: string; // e.g. "[a]"
}

export interface TrainosCanonicalEvidence {
  courseId: string;
  courseTitle: string;
  courseVersion: string;
  courseEffectiveDate: string;
  courseContentHash: string;
  courseContentUri?: string;

  controlMappings: TrainosControlMapping[];
  objectiveStatements?: string[];

  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  learnerRole?: string;

  organizationId: string;
  organizationName?: string;
  organizationCageCode?: string;

  assignmentId: string;
  attemptId: string;
  attemptNumber: number;
  questionSetId?: string;
  questionSetVersion?: number;
  questionsHash?: string;
  questionResultsHash?: string;

  score: number;
  passingThreshold: number;
  passed: boolean;
  failedTopicCounts?: Record<string, number>;
  modulesCompleted?: string[];
  moduleCount?: number;

  acknowledgement: {
    statements: string[];
    accepted: boolean;
    acceptedAt: string;
    ipAddress?: string;
    userAgent?: string;
    statementsHash?: string;
  };

  completedAt: string;
  issuedBySystem: string;
}

export interface TrainosLedgerInfo {
  sequenceNumber: string;
  previousEntryHash: string;
  currentEntryHash: string;
}

export interface TrainosEvidenceEnvelope {
  evidenceRecordId: string;
  kind: string;
  evidenceHash: string;
  ledger: TrainosLedgerInfo;
  canonicalizationVersion: string;
  canonical: TrainosCanonicalEvidence;
}

export interface TrainosCertificateRef {
  certificateNumber: string;
  certificateHash: string;
  pdfHash: string;
  verificationUrl: string;
}

export interface TrainosTenantRef {
  id: string;
  name?: string;
  cageCode?: string;
}

/** Inbound POST body for `evidence.attempt.completed`. */
export interface TrainosAttemptCompletedEvent {
  event: "evidence.attempt.completed";
  deliveryId: string;
  occurredAt: string;
  schemaVersion?: string;
  tenant: TrainosTenantRef;
  evidence: TrainosEvidenceEnvelope;
  certificate?: TrainosCertificateRef;
}

/** Per-objective verdict line in the response. */
export interface PerObjectiveVerdict {
  controlId: string;
  objective: string;
  verdict: Exclude<TrainosVerdict, "IDEMPOTENT_REPLAY">;
  rationale: string;
  remediation?: string;
}

/** Outbound response body. */
export interface TrainosVerdictResponse {
  deliveryId: string;
  verdict: TrainosVerdict;
  perObjective: PerObjectiveVerdict[];
  policyVersion: string;
  adjudicatedAt: string;
  /** Set when verdict === "IDEMPOTENT_REPLAY" — original adjudication time. */
  originalAdjudicatedAt?: string;
}
