import { createHash } from "crypto";
import { z } from "zod";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const INTAKE_METADATA_EVENT_TYPES = [
  "intake_upload_authorization",
  "intake_upload_started",
  "intake_upload_completed",
  "intake_rejected",
  "intake_expired",
  "intake_replay_blocked",
] as const;

export type IntakeMetadataEventType = (typeof INTAKE_METADATA_EVENT_TYPES)[number];

export const INTAKE_METADATA_EVENT_STATUSES = [
  "issued",
  "preflight_recorded",
  "upload_started",
  "upload_completed",
  "rejected",
  "expired",
  "replay_blocked",
] as const;

export type IntakeMetadataEventStatus = (typeof INTAKE_METADATA_EVENT_STATUSES)[number];

const PROHIBITED_FIELD_NAMES = new Set(
  [
    "raw_content",
    "raw_payload",
    "raw_event_body",
    "plaintext_cui",
    "file_contents",
    "base64_file",
    "original_filename",
    "filename",
    "file_name",
    "blob_path",
    "vault_destination_path",
    "sas_url",
    "sas_token",
    "upload_url",
    "content",
    "bytes",
    "file_bytes",
    "extracted_text",
    "raw_text",
    "path",
  ].map((k) => k.toLowerCase()),
);

const PROHIBITED_VALUE_SNIPPETS = [/([?&](sig|se|sp|sr|skoid|sktid|skt|ske)=)/i, /sv=\d{4}-\d{2}-\d{2}/i];

const LEGACY_KEY_ALIASES: Record<string, string> = {
  eventId: "event_id",
  eventType: "event_type",
  transactionId: "transaction_id",
  objectReferenceToken: "object_reference_token",
  issuedByActorId: "issued_by_actor_id",
  recipientEmail: "recipient_email",
  recipientEmailHash: "recipient_email_hash",
  artifactType: "artifact_type",
  tokenId: "token_id",
  tokenExpiresAtUtc: "token_expires_at_utc",
  eventTimestampUtc: "event_timestamp_utc",
  boundaryAssertion: "boundary_assertion",
  uploadDestination: "upload_destination",
  plannedBundleHashSha256: "planned_bundle_hash_sha256",
  contentHashSha256: "content_hash_sha256",
  sizeBytes: "size_bytes",
  uploadCompletedAtUtc: "upload_completed_at_utc",
  malwareScanStatus: "malware_scan_status",
  policyVersion: "policy_version",
  evidenceTraceId: "evidence_trace_id",
  correlationId: "correlation_id",
  sourceSystem: "source_system",
};

const LEGACY_EVENT_TYPE_ALIASES: Record<string, IntakeMetadataEventType> = {
  intake_preflight_recorded: "intake_upload_authorization",
  intake_upload_authorized: "intake_upload_authorization",
  intake_upload_initiated: "intake_upload_started",
  intake_upload_finished: "intake_upload_completed",
  intake_upload_rejected: "intake_rejected",
  intake_token_expired: "intake_expired",
  intake_token_replay_blocked: "intake_replay_blocked",
};

const LEGACY_STATUS_ALIASES: Record<string, IntakeMetadataEventStatus> = {
  authorization_recorded: "preflight_recorded",
  preflight_accepted: "preflight_recorded",
  started: "upload_started",
  completed: "upload_completed",
  blocked: "replay_blocked",
};

const baseIntakeEventSchema = z
  .object({
    event_id: z.string().regex(UUID_RX, "event_id must be a UUID"),
    event_type: z.enum(INTAKE_METADATA_EVENT_TYPES),
    transaction_id: z.string().min(1).max(100),
    object_reference_token: z.string().min(1).max(256).optional().nullable(),
    issued_by_actor_id: z.string().min(1).max(200).optional().nullable(),
    recipient_email: z.string().email().optional().nullable(),
    recipient_email_hash: z
      .string()
      .regex(SHA256_HEX, "recipient_email_hash must be SHA-256 hex")
      .optional()
      .nullable(),
    artifact_type: z.string().min(1).max(120).optional().nullable(),
    token_id: z.string().min(1).max(200).optional().nullable(),
    token_expires_at_utc: z.string().datetime({ offset: true }).optional().nullable(),
    event_timestamp_utc: z.string().datetime({ offset: true }).optional().nullable(),
    boundary_assertion: z.literal("metadata_only").default("metadata_only"),
    upload_destination: z.literal("azure_blob_direct").default("azure_blob_direct"),
    planned_bundle_hash_sha256: z
      .string()
      .regex(SHA256_HEX, "planned_bundle_hash_sha256 must be SHA-256 hex")
      .optional()
      .nullable(),
    content_hash_sha256: z
      .string()
      .regex(SHA256_HEX, "content_hash_sha256 must be SHA-256 hex")
      .optional()
      .nullable(),
    size_bytes: z.number().int().nonnegative().optional().nullable(),
    upload_completed_at_utc: z.string().datetime({ offset: true }).optional().nullable(),
    malware_scan_status: z.string().min(1).max(80).optional().nullable(),
    policy_version: z.string().min(1).max(80),
    evidence_trace_id: z.string().min(1).max(200).optional().nullable(),
    correlation_id: z.string().min(1).max(200),
    source_system: z.literal("enclavewatch").default("enclavewatch"),
    status: z.enum(INTAKE_METADATA_EVENT_STATUSES).optional().nullable(),
  })
  .strict();

export type IntakeEventPayload = z.infer<typeof baseIntakeEventSchema>;

export type ValidatedIntakeEvent = {
  eventId: string;
  eventType: IntakeMetadataEventType;
  status: IntakeMetadataEventStatus;
  transactionId: string;
  objectReferenceToken: string | null;
  issuedByActorId: string | null;
  recipientEmailHash: string | null;
  artifactType: string | null;
  tokenId: string | null;
  tokenExpiresAtUtc: Date | null;
  eventTimestampUtc: Date;
  timestampBucket: string;
  boundaryAssertion: "metadata_only";
  uploadDestination: "azure_blob_direct";
  plannedBundleHashSha256: string | null;
  contentHashSha256: string | null;
  sizeBytes: number | null;
  uploadCompletedAtUtc: Date | null;
  malwareScanStatus: string | null;
  policyVersion: string;
  evidenceTraceId: string | null;
  correlationId: string;
  sourceSystem: "enclavewatch";
};

const DEFAULT_STATUS_BY_EVENT_TYPE: Record<IntakeMetadataEventType, IntakeMetadataEventStatus> = {
  intake_upload_authorization: "preflight_recorded",
  intake_upload_started: "upload_started",
  intake_upload_completed: "upload_completed",
  intake_rejected: "rejected",
  intake_expired: "expired",
  intake_replay_blocked: "replay_blocked",
};

export function getDefaultStatusForEventType(
  eventType: IntakeMetadataEventType,
): IntakeMetadataEventStatus {
  return DEFAULT_STATUS_BY_EVENT_TYPE[eventType];
}

export function buildTimestampBucket(date: Date): string {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  const hh = `${date.getUTCHours()}`.padStart(2, "0");
  const mm = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readRecipientHashPepper(): string {
  const pepper = process.env.INTAKE_RECIPIENT_EMAIL_HASH_PEPPER?.trim();
  if (!pepper) {
    throw new Error("INTAKE_RECIPIENT_EMAIL_HASH_PEPPER must be configured");
  }
  return pepper;
}

export function hashRecipientEmail(email: string): string {
  const pepper = readRecipientHashPepper();
  return createHash("sha256").update(`${pepper}:${normalizeEmail(email)}`).digest("hex");
}

function valueLooksLikeSensitiveToken(value: string): boolean {
  return PROHIBITED_VALUE_SNIPPETS.some((rx) => rx.test(value));
}

export function findForbiddenField(
  value: unknown,
  path: string[] = [],
): { path: string; reason: string } | null {
  if (value == null) return null;

  if (typeof value === "string" && valueLooksLikeSensitiveToken(value)) {
    return {
      path: path.join("."),
      reason: "prohibited token or SAS-like value detected",
    };
  }

  if (typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenField(value[i], [...path, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (PROHIBITED_FIELD_NAMES.has(key.toLowerCase())) {
      return {
        path: [...path, key].join("."),
        reason: "prohibited metadata field key detected",
      };
    }
    const found = findForbiddenField(obj[key], [...path, key]);
    if (found) return found;
  }
  return null;
}

export function parseIntakeEventPayload(payload: unknown): ValidatedIntakeEvent {
  const normalizedPayload = normalizeLegacyIntakePayload(payload);
  const parsed = baseIntakeEventSchema.parse(normalizedPayload);
  const eventTimestamp = parsed.event_timestamp_utc
    ? new Date(parsed.event_timestamp_utc)
    : new Date();
  const status = parsed.status ?? getDefaultStatusForEventType(parsed.event_type);
  const recipientEmailHash = parsed.recipient_email_hash
    ? parsed.recipient_email_hash.toLowerCase()
    : parsed.recipient_email
      ? hashRecipientEmail(parsed.recipient_email)
      : null;

  return {
    eventId: parsed.event_id.toLowerCase(),
    eventType: parsed.event_type,
    status,
    transactionId: parsed.transaction_id,
    objectReferenceToken: parsed.object_reference_token ?? null,
    issuedByActorId: parsed.issued_by_actor_id ?? null,
    recipientEmailHash,
    artifactType: parsed.artifact_type ?? null,
    tokenId: parsed.token_id ?? null,
    tokenExpiresAtUtc: parsed.token_expires_at_utc ? new Date(parsed.token_expires_at_utc) : null,
    eventTimestampUtc: eventTimestamp,
    timestampBucket: buildTimestampBucket(eventTimestamp),
    boundaryAssertion: "metadata_only",
    uploadDestination: "azure_blob_direct",
    plannedBundleHashSha256: parsed.planned_bundle_hash_sha256?.toLowerCase() ?? null,
    contentHashSha256: parsed.content_hash_sha256?.toLowerCase() ?? null,
    sizeBytes: parsed.size_bytes ?? null,
    uploadCompletedAtUtc: parsed.upload_completed_at_utc
      ? new Date(parsed.upload_completed_at_utc)
      : null,
    malwareScanStatus: parsed.malware_scan_status ?? null,
    policyVersion: parsed.policy_version,
    evidenceTraceId: parsed.evidence_trace_id ?? null,
    correlationId: parsed.correlation_id,
    sourceSystem: "enclavewatch",
  };
}

function normalizeLegacyIntakePayload(payload: unknown): unknown {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const input = payload as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...input };

  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_KEY_ALIASES)) {
    if (
      normalized[canonicalKey] == null &&
      Object.prototype.hasOwnProperty.call(normalized, legacyKey)
    ) {
      normalized[canonicalKey] = normalized[legacyKey];
    }
    delete normalized[legacyKey];
  }

  if (typeof normalized.event_type === "string") {
    const mappedEventType = LEGACY_EVENT_TYPE_ALIASES[normalized.event_type];
    if (mappedEventType) normalized.event_type = mappedEventType;
  }

  if (typeof normalized.status === "string") {
    const mappedStatus = LEGACY_STATUS_ALIASES[normalized.status];
    if (mappedStatus) normalized.status = mappedStatus;
  }

  return normalized;
}
