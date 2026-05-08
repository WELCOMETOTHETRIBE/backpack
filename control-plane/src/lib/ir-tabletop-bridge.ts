/**
 * IR Tabletop bridge — service-to-service auth + Zod contract for the
 * MacTech_Training -> control-plane API.
 *
 * Auth model:
 *  - Service mode (training -> control-plane): bearer token + HMAC-SHA256 over
 *    `${timestamp}.${rawBody}`. Replay-resistant (5-minute clock skew window).
 *  - Session mode (control-plane UI -> control-plane): standard Clerk session
 *    via requireOrg(); used by assessor read-only views and any in-app actions.
 *
 * Env vars:
 *   IR_TABLETOP_BRIDGE_TOKEN  - shared bearer secret (must match in both repos)
 *   IR_TABLETOP_BRIDGE_HMAC   - shared HMAC secret (separate from bearer)
 *
 * Contract version pinned in BRIDGE_CONTRACT_VERSION; bumped on breaking changes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export const BRIDGE_CONTRACT_VERSION = "ir-tabletop.v1";
const HMAC_HEADER = "x-ir-bridge-signature";
const TIMESTAMP_HEADER = "x-ir-bridge-timestamp";
const ORG_HEADER = "x-ir-bridge-org";
const USER_EMAIL_HEADER = "x-ir-bridge-user-email";
const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Unified result for both service-mode (HMAC bearer) and session-mode (Clerk).
 * `userId` is the resolved internal users.id (null when service-mode without a
 * resolvable user-email header, or when the email doesn't map to a known user).
 */
export type BridgeAuthResult = {
  mode: "service" | "session";
  organizationId: string;
  userId: string | null;
  serviceCaller?: string;
};

export class BridgeAuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = "BridgeAuthError";
  }
}

/**
 * Resolve an org identifier to the internal organizations.id (UUID).
 * Accepts either a UUID directly, or a Clerk org id (org_*).
 */
async function resolveOrganizationId(input: string): Promise<string | null> {
  if (input.startsWith("org_")) {
    const row = (
      await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.clerkOrgId, input))
        .limit(1)
    )[0];
    return row?.id ?? null;
  }
  // Treat as UUID; verify existence to avoid trusting arbitrary strings.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  ) {
    return null;
  }
  const row = (
    await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input))
      .limit(1)
  )[0];
  return row?.id ?? null;
}

/** Resolve internal users.id for a given email; null if no match. */
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const row = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];
  return row?.id ?? null;
}

/**
 * Verify a service-to-service request:
 *   Authorization: Bearer <IR_TABLETOP_BRIDGE_TOKEN>
 *   X-IR-Bridge-Timestamp: <unix-millis>
 *   X-IR-Bridge-Signature: <hex hmac-sha256(`${timestamp}.${rawBody}`)>
 *   X-IR-Bridge-Org: <organization uuid OR clerk org id (org_*)>
 *   X-IR-Bridge-User-Email: <email>     (optional; resolved to users.id)
 *   X-IR-Bridge-Caller: <service name>  (optional; default "mactech-training")
 */
async function verifyServiceRequest(
  req: Request,
  rawBody: string
): Promise<{ organizationId: string; userId: string | null; serviceCaller: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new BridgeAuthError("Missing bearer token", 401);
  }
  const presentedToken = authHeader.slice("Bearer ".length).trim();
  const expectedToken = process.env.IR_TABLETOP_BRIDGE_TOKEN;
  if (!expectedToken) {
    throw new BridgeAuthError("Server misconfigured: bridge token missing", 500);
  }
  // Constant-time bearer compare
  const a = Buffer.from(presentedToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BridgeAuthError("Invalid bearer token", 401);
  }

  const ts = req.headers.get(TIMESTAMP_HEADER);
  if (!ts) throw new BridgeAuthError(`Missing ${TIMESTAMP_HEADER}`, 401);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) throw new BridgeAuthError("Invalid timestamp", 401);
  const skew = Math.abs(Date.now() - tsNum);
  if (skew > CLOCK_SKEW_MS) {
    throw new BridgeAuthError(`Timestamp outside ${CLOCK_SKEW_MS}ms skew window`, 401);
  }

  const presentedSig = req.headers.get(HMAC_HEADER);
  if (!presentedSig) throw new BridgeAuthError(`Missing ${HMAC_HEADER}`, 401);
  const hmacSecret = process.env.IR_TABLETOP_BRIDGE_HMAC;
  if (!hmacSecret) throw new BridgeAuthError("Server misconfigured: HMAC secret missing", 500);

  const expectedSig = createHmac("sha256", hmacSecret).update(`${ts}.${rawBody}`).digest("hex");
  const sigA = Buffer.from(presentedSig);
  const sigB = Buffer.from(expectedSig);
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    throw new BridgeAuthError("HMAC signature mismatch", 401);
  }

  const orgHeader = req.headers.get(ORG_HEADER);
  if (!orgHeader) throw new BridgeAuthError(`Missing ${ORG_HEADER}`, 401);
  const resolvedOrgId = await resolveOrganizationId(orgHeader);
  if (!resolvedOrgId) {
    throw new BridgeAuthError(`Unknown organization in ${ORG_HEADER}`, 401);
  }

  const userEmailHeader = req.headers.get(USER_EMAIL_HEADER);
  const userId = userEmailHeader
    ? await resolveUserIdByEmail(userEmailHeader)
    : null;

  return {
    organizationId: resolvedOrgId,
    userId,
    serviceCaller: req.headers.get("x-ir-bridge-caller") ?? "mactech-training",
  };
}

/**
 * Authorize an inbound /api/ir-tabletop/* request, supporting both service-mode
 * (HMAC bearer) and session-mode (Clerk user). Routes call this at the top.
 *
 * Pass the rawBody (string from req.text()) so HMAC verification can hash the
 * exact bytes the client signed. Re-parse JSON via z.parse on the same string.
 */
export async function authorizeIrRequest(
  req: Request,
  rawBody: string
): Promise<BridgeAuthResult> {
  const hasBearer = req.headers.get("authorization")?.startsWith("Bearer ");
  if (hasBearer) {
    const verified = await verifyServiceRequest(req, rawBody);
    return {
      mode: "service",
      organizationId: verified.organizationId,
      userId: verified.userId,
      serviceCaller: verified.serviceCaller,
    };
  }
  // Session path: full auth() so we get userId in addition to org.
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new BridgeAuthError("Unauthorized: no organization context", 401);
  }
  return {
    mode: "session",
    organizationId: session.user.organizationId,
    userId: session.user.id ?? null,
  };
}

// ============== Zod contract — request/response shapes ==============
// Versioned via BRIDGE_CONTRACT_VERSION. Bumped on breaking changes.

const ControlIdSchema = z.string().regex(
  /^[A-Z]{2}\.L[1-3]-3\.\d+\.\d+$/,
  "Expected NIST 800-171/CMMC control id like 'IR.L2-3.6.1'"
);

const IsoDateTimeSchema = z.string().datetime();
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");

const MethodologySchema = z.enum(["tabletop", "walkthrough", "functional"]);
const DifficultySchema = z.enum(["management", "mixed", "technical"]);
const ParticipantRoleSchema = z.enum([
  "facilitator",
  "approver",
  "executive",
  "it_admin",
  "program_manager",
  "security_lead",
  "mactech_support",
  "observer",
  "other",
]);
const InjectStatusSchema = z.enum(["pass", "partial", "fail", "not_reached"]);
const FinalResultSchema = z.enum(["pass", "partial", "needs_remediation"]);
const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const ReportingAuthoritiesSchema = z.object({
  dibNetEnabled: z.boolean(),
  contractOfficerName: z.string().optional(),
  contractOfficerEmail: z.string().email().optional(),
  mssp: z
    .object({ name: z.string(), contact: z.string() })
    .optional(),
  otherChannels: z
    .array(
      z.object({
        name: z.string(),
        contact: z.string(),
        purpose: z.string(),
      })
    )
    .optional(),
});

export const CreateExerciseRequestSchema = z.object({
  /**
   * Optional. When omitted, control-plane uses the auth-derived org from the
   * bridge headers. Training callers never know the control-plane UUID, so
   * they should leave this unset and let the server resolve it.
   */
  organizationId: z.string().uuid().optional(),
  scenarioId: z.string().uuid(),
  boundaryId: z.string().optional(),
  name: z.string().min(1).max(200),
  methodology: MethodologySchema,
  methodologyJustification: z.string().min(20),
  scopeStatement: z.string().min(20),
  cuiCategories: z.array(z.string()).default([]),
  customerName: z.string().min(1),
  contractProgramName: z.string().optional(),
  systemName: z.string().min(1),
  environmentDescription: z.string().min(1),
  reportingAuthorities: ReportingAuthoritiesSchema,
  scheduledFor: IsoDateTimeSchema.optional(),
  /** Phase 11: per-exercise difficulty. Defaults to 'mixed'. */
  difficulty: DifficultySchema.optional(),
  /** Snapshot of CMMC control_ids tested; primary IR + adjacent. */
  controlIds: z
    .array(
      z.object({
        controlId: ControlIdSchema,
        isPrimary: z.boolean().default(false),
      })
    )
    .min(1),
});
export type CreateExerciseRequest = z.infer<typeof CreateExerciseRequestSchema>;

export const UpdateExerciseRequestSchema = CreateExerciseRequestSchema.partial().extend({
  facilitatorUserId: z.string().uuid().optional(),
  approverUserId: z.string().uuid().optional(),
  executedAt: IsoDateTimeSchema.optional(),
  plannerNotes: z.string().optional(),
  difficulty: DifficultySchema.optional(),
});
export type UpdateExerciseRequest = z.infer<typeof UpdateExerciseRequestSchema>;

// ============== Phase 11: AI-assisted AAR drafting ==============
const AarSectionKeySchema = z.enum([
  "executiveSummary",
  "timelineNarrative",
  "strengths",
  "gaps",
  "evidenceReviewed",
]);
export type AarSectionKey = z.infer<typeof AarSectionKeySchema>;

export const DraftAarSectionRequestSchema = z.object({
  section: AarSectionKeySchema,
  /** Optional: existing draft text the user has already typed.
   *  When present, the AI improves/extends rather than replacing wholesale. */
  existingText: z.string().optional(),
});
export type DraftAarSectionRequest = z.infer<typeof DraftAarSectionRequestSchema>;

// ============== Phase 12: AI custom scenario generator ==============
const MitreTtpSchema = z
  .string()
  .regex(/^T\d{4}(\.\d{3})?$/, "Expected MITRE technique ID like T1078 or T1078.003");

const DraftedScenarioInjectSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[A-Za-z0-9_+\-]+$/, "key must be alphanumeric/dash/underscore/plus only"),
  offsetMinutes: z.number().int().min(0).max(240),
  prompt: z.string().min(20).max(2000),
  expectedAction: z.string().min(10).max(1000),
  controlIds: z.array(ControlIdSchema).min(1),
  passCriteria: z.string().min(20).max(500),
  mitreTtps: z.array(MitreTtpSchema).default([]),
});

export const DraftedScenarioSchema = z.object({
  title: z.string().min(5).max(200),
  summary: z.string().min(20).max(500),
  narrative: z.string().min(50).max(3000),
  targetedControlIds: z.array(ControlIdSchema).min(1),
  defaultRoe: z.string().min(20).max(2000),
  injectsJson: z.array(DraftedScenarioInjectSchema).min(4).max(12),
});
export type DraftedScenario = z.infer<typeof DraftedScenarioSchema>;

export const GenerateScenarioRequestSchema = z.object({
  /** Plain-language description of the scenario the customer wants drafted. */
  prompt: z.string().min(10).max(2000),
  /** Optional: refinement on a previous draft. The endpoint will pass both
   *  the original prompt and the previous draft to Claude for improvement. */
  previousDraft: DraftedScenarioSchema.optional(),
  refinementPrompt: z.string().max(2000).optional(),
});
export type GenerateScenarioRequest = z.infer<typeof GenerateScenarioRequestSchema>;

export const CreateScenarioRequestSchema = DraftedScenarioSchema;
export type CreateScenarioRequest = z.infer<typeof CreateScenarioRequestSchema>;

export const AddParticipantsRequestSchema = z.object({
  participants: z
    .array(
      z.object({
        userId: z.string().uuid().nullable(),
        name: z.string().min(1),
        organization: z.string().min(1),
        title: z.string().optional(),
        role: ParticipantRoleSchema,
        email: z.string().email().optional(),
      })
    )
    .min(1),
});
export type AddParticipantsRequest = z.infer<typeof AddParticipantsRequestSchema>;

export const InjectResponseSchema = z.object({
  injectKey: z.string().min(1).max(64),
  injectPromptSnapshot: z.string().min(1),
  expectedActionSnapshot: z.string().min(1),
  status: InjectStatusSchema,
  actualResponseNotes: z.string().optional(),
  decisionOffsetMinutes: z.number().int().nonnegative().optional(),
  decisionTimestamp: IsoDateTimeSchema.optional(),
});
export const RecordInjectResponsesRequestSchema = z.object({
  responses: z.array(InjectResponseSchema).min(1),
});
export type RecordInjectResponsesRequest = z.infer<typeof RecordInjectResponsesRequestSchema>;

/** Optional inline corrective action attached to a finding at draft time. */
export const InlineCorrectiveActionSchema = z.object({
  weakness: z.string().min(1),
  controlReference: ControlIdSchema,
  resourcesRequired: z.string().optional(),
  scheduledCompletionDate: IsoDateSchema.optional(),
  status: z
    .enum(["open", "in_progress", "blocked", "completed", "deferred"])
    .optional(),
  ownerName: z.string().optional(),
  notes: z.string().optional(),
});

export const FindingInputSchema = z.object({
  controlId: ControlIdSchema,
  severity: SeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  /** Optional CAR row drafted alongside the finding. */
  correctiveAction: InlineCorrectiveActionSchema.optional(),
});

export const DraftAarRequestSchema = z.object({
  executiveSummary: z.string().min(20),
  timelineNarrative: z.string().min(20),
  strengths: z.string().optional(),
  gaps: z.string().optional(),
  evidenceReviewed: z.string().optional(),
  finalResult: FinalResultSchema,
  findings: z.array(FindingInputSchema).default([]),
});
export type DraftAarRequest = z.infer<typeof DraftAarRequestSchema>;

export const AddFindingsRequestSchema = z.object({
  findings: z.array(FindingInputSchema).min(1),
});
export type AddFindingsRequest = z.infer<typeof AddFindingsRequestSchema>;

export const UpdateFindingRequestSchema = z.object({
  controlId: ControlIdSchema.optional(),
  severity: SeveritySchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type UpdateFindingRequest = z.infer<typeof UpdateFindingRequestSchema>;

export const UpdateCorrectiveActionRequestSchema = z.object({
  weakness: z.string().min(1).optional(),
  controlReference: ControlIdSchema.optional(),
  resourcesRequired: z.string().nullable().optional(),
  scheduledCompletionDate: IsoDateSchema.nullable().optional(),
  status: z
    .enum(["open", "in_progress", "blocked", "completed", "deferred"])
    .optional(),
  ownerName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateCorrectiveActionRequest = z.infer<
  typeof UpdateCorrectiveActionRequestSchema
>;

export const ApproveAarRequestSchema = z.object({
  /** Required: the approver user must differ from the drafter (enforced server-side + via DB CHECK). */
  approverUserId: z.string().uuid(),
  approvalSignatureRef: z.string().min(1),
});
export type ApproveAarRequest = z.infer<typeof ApproveAarRequestSchema>;

/**
 * Per-named-participant attestation block. Facilitator click-signs for the
 * party; this row records the basis for each named attendee. The participant
 * gets an email confirmation link post-archive (ir_participant_disputes).
 */
/**
 * Identifier shape regex for cross-system IDs that arrive on this payload.
 *
 * TrainOS uses Prisma cuids (e.g. `cmotizdrk00010gsbvo78l859`) for both
 * User.id and Participant.id; synthetic pilot-mode rows use prefixed
 * forms like `pilot-smoke-participant-001`. Codex itself uses uuids.
 *
 * Earlier the schema required `.uuid()`, which 4xx'd every TrainOS
 * payload because cuids will never match that regex. Backfilling
 * TrainOS to uuids would require a multi-table reference rewrite — not
 * worth it for an ID we treat opaquely on the Codex side anyway. The
 * regex enforces shape (printable, bounded length, no path-traversal
 * surprises) without locking to one generator.
 */
const CROSS_SYSTEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const AttestationBasisSchema = z.object({
  participantId: z
    .string()
    .regex(CROSS_SYSTEM_ID_RE, "expected cuid / uuid / printable id (≤64 chars)")
    .nullable(),
  participantName: z.string().min(1),
  participantEmail: z.string().email().nullable(),
  participantRole: z.string().nullable(),
  attestationBasis: z.enum(["present_in_room", "present_via_video", "present_via_phone"]),
  signedAt: IsoDateTimeSchema,
  signedByUserId: z
    .string()
    .regex(CROSS_SYSTEM_ID_RE, "expected cuid / uuid / printable id (≤64 chars)"),
});
export type AttestationBasis = z.infer<typeof AttestationBasisSchema>;

export const UploadBundleManifestSchema = z.object({
  bundleVersion: z.number().int().positive().default(1),
  manifest: z.record(z.string(), z.unknown()),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected lowercase hex sha256"),
  /**
   * sha256 of the bundle ZIP bytes themselves. Required for the anchor
   * chain — the manifest hash and the bundle hash are distinct values
   * committed together so neither can be tampered without the other.
   */
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected lowercase hex sha256"),
  timestampToken: z.string().optional(),
  timestampedAt: IsoDateTimeSchema.optional(),
  /** Caller-provided storage key (rare). Normally control-plane derives this when bytes are uploaded. */
  storagePrefix: z.string().optional(),
  /**
   * @deprecated Codex no longer accepts inline ZIP bytes. CUI must live in
   * the customer's vault (Azure Gov blob), not on the control-plane host.
   * Send vaultStorageUri instead. Field tolerated transiently for backward
   * compat — will be removed in the next migration cycle.
   */
  bundleZipBase64: z.string().optional(),
  /**
   * Azure Gov blob URL where the bundle ZIP lives. Required for any new
   * bundle upload. Codex stores the URI + the sha256s but never the bytes
   * — keeps Codex out of the CUI authorization boundary.
   */
  vaultStorageUri: z
    .string()
    .url()
    .optional()
    // Defense-in-depth host guard for the customer-Azure-Gov boundary.
    // TrainOS validates this on the upload side (3cd0122) but a paranoid
    // C3PAO will want to see Codex enforce it independently. Reject
    // commercial Azure (.blob.core.windows.net) outright; allow the rest
    // and surface non-Gov hosts as a route-level warning so misconfigs are
    // visible without breaking customer flexibility (e.g. local dev
    // proxies, future air-gapped clouds).
    //
    // Pilot escape hatch: CODEX_ALLOW_COMMERCIAL_AZURE_FOR_DEV=true
    // downgrades the reject to a route-level warning + audit marker so
    // smoke testing can proceed before MacTech's Azure Gov subscription
    // lands. Default OFF; mirrors TrainOS's TRAINOS_ALLOW_COMMERCIAL_
    // AZURE_FOR_DEV. Both flags are removed once Gov subscription is
    // live — see route.ts for the audit-log breadcrumb on bypassed
    // bundles.
    .refine(
      (url) => {
        if (!url) return true;
        if (process.env.CODEX_ALLOW_COMMERCIAL_AZURE_FOR_DEV === "true") {
          return true; // pilot bypass — logged at route level
        }
        try {
          const host = new URL(url).host.toLowerCase();
          return !host.endsWith(".blob.core.windows.net");
        } catch {
          return false;
        }
      },
      {
        message:
          "vault_storage_uri host is commercial Azure (.blob.core.windows.net). CUI bundles must live in Azure Gov (.usgovcloudapi.net). Reject.",
      }
    ),
  vaultStorageRegion: z.string().optional(),
  /**
   * Set to true by TrainOS when the bundle ZIP was actually uploaded to
   * the customer's Azure Gov blob (vs the pre-3cd0122 stub mode that
   * returned a placeholder URI). Persisted on ir_exercise_bundles for
   * C3PAO breadcrumb. Defaults false if absent — manifest-only bundles
   * are still accepted but flagged.
   *
   * Accept both `bytesPersisted` (original name) and `vaultBytesPersisted`
   * (TrainOS post-rename) so a future field rename in either direction
   * doesn't silently flip the column to false. Route handler reads
   * whichever is set; if both, vaultBytesPersisted wins (closer to the
   * post-upload truth).
   */
  bytesPersisted: z.boolean().optional(),
  vaultBytesPersisted: z.boolean().optional(),
  /**
   * When the exercise actually ran (NOT when the ZIP was generated).
   * Codex enforces validThroughAt = executedAt + 365 days for 3.6.3.
   */
  executedAt: IsoDateTimeSchema.optional(),
  /**
   * Per-named-participant attestation. One entry per attendee the
   * facilitator click-signed for during the run console. Empty array
   * acceptable for the bundle to upload, but Codex will stamp the
   * exercise as facilitator_only and 3.6.3 won't be satisfied.
   */
  attestationBasis: z.array(AttestationBasisSchema).optional(),
  /**
   * Source of corroborating attendance evidence beyond the facilitator's word.
   *   - 'teams_csv'           — Teams attendance CSV uploaded as a bundle file
   *   - 'signed_roster_image' — Photo/scan of in-person wet-signed roster
   *   - 'facilitator_only'    — Bundle relies on facilitator attestation alone
   *                             (satisfies 3.6.1 capability only, not 3.6.3 testing)
   */
  attendanceCorroborationKind: z
    .enum(["teams_csv", "signed_roster_image", "facilitator_only"])
    .optional(),
  /** sha256 of the corroboration file (Teams CSV or roster image), if any. */
  attendanceCorroborationFileSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  files: z
    .array(
      z.object({
        filename: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().nonnegative(),
        mimeType: z.string().optional(),
      })
    )
    .min(1),
});
export type UploadBundleManifest = z.infer<typeof UploadBundleManifestSchema>;

// ============== Route helpers ==============
/** Standard error envelope for /api/ir-tabletop/* routes. */
export function bridgeErrorResponse(e: unknown): NextResponse {
  if (e instanceof BridgeAuthError) {
    return NextResponse.json(
      { error: e.message, contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: e.statusCode }
    );
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: e.issues, contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: 400 }
    );
  }
  const msg = e instanceof Error ? e.message : "Internal error";
  const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json(
    { error: msg, contractVersion: BRIDGE_CONTRACT_VERSION },
    { status }
  );
}

/**
 * Insert an audit log entry. Best-effort — logs to console on failure but does
 * not propagate the error (callers should never fail their main operation
 * because audit logging fell over).
 *
 * Usage:
 *   await logIrAuditEvent({
 *     organizationId: auth.organizationId,
 *     userId: auth.userId,
 *     action: "aar_approved",
 *     resourceType: "ir_aar",
 *     resourceId: aar.id,
 *     details: { exerciseId, drafterUserId },
 *     req,
 *   })
 */
export async function logIrAuditEvent(opts: {
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details?: Record<string, unknown>;
  req?: Request;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      organizationId: opts.organizationId,
      userId: opts.userId,
      action: opts.action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      details: opts.details ?? null,
      ip: opts.req?.headers.get("x-forwarded-for") ?? null,
    });
  } catch (e) {
    console.error("[ir-tabletop] logIrAuditEvent failed:", e);
  }
}

/** Stub response for routes whose business logic is deferred to a later phase. */
export function notImplementedYet(phaseLabel: string = "1b"): NextResponse {
  return NextResponse.json(
    {
      error: "Not Implemented",
      phase: `Phase ${phaseLabel} stub: contract locked, business logic pending`,
      contractVersion: BRIDGE_CONTRACT_VERSION,
    },
    { status: 501 }
  );
}
