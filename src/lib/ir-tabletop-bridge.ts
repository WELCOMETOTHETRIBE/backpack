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
import { organizations, users } from "@/db/schema";
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
});
export type UpdateExerciseRequest = z.infer<typeof UpdateExerciseRequestSchema>;

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

export const ApproveAarRequestSchema = z.object({
  /** Required: the approver user must differ from the drafter (enforced server-side + via DB CHECK). */
  approverUserId: z.string().uuid(),
  approvalSignatureRef: z.string().min(1),
});
export type ApproveAarRequest = z.infer<typeof ApproveAarRequestSchema>;

export const UploadBundleManifestSchema = z.object({
  bundleVersion: z.number().int().positive().default(1),
  manifest: z.record(z.string(), z.unknown()),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/, "Expected lowercase hex sha256"),
  timestampToken: z.string().optional(),
  timestampedAt: IsoDateTimeSchema.optional(),
  retentionUntil: IsoDateSchema,
  storagePrefix: z.string().optional(),
  /** evidence_run row to reuse (dedicated source='ir_tabletop' run); null = create new. */
  evidenceRunId: z.string().uuid().nullable(),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        sizeBytes: z.number().int().nonnegative(),
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
