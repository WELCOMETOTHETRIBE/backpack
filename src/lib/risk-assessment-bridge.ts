/**
 * Risk Assessment bridge — service-to-service auth + Zod contract for
 * the MacTech Training → Codex (control-plane) API.
 *
 * Mirrors src/lib/ir-tabletop-bridge.ts so a TrainOS engineer who
 * integrated the IR tabletop bridge writes this one identically.
 *
 * Auth model
 * ----------
 *   - Service mode (TrainOS → Codex):
 *       Authorization: Bearer <RA_BRIDGE_TOKEN>
 *       X-RA-Bridge-Timestamp: <unix-millis>
 *       X-RA-Bridge-Signature: hex(hmac-sha256(`${ts}.${rawBody}`, RA_BRIDGE_HMAC))
 *       X-RA-Bridge-Org: <org uuid OR clerk org id (org_*)>
 *       X-RA-Bridge-User-Email: <email>     (optional; resolved to users.id)
 *       X-RA-Bridge-Caller: <service name>  (optional; default "mactech-training")
 *
 *   - Session mode (Codex UI → Codex):
 *       Standard Clerk session via auth(). Used by the assessor read-only
 *       view and any in-app fixups.
 *
 * Env vars (must be set in both repos):
 *   RA_BRIDGE_TOKEN  - shared bearer secret
 *   RA_BRIDGE_HMAC   - shared HMAC secret (separate from bearer)
 *
 * Contract version pinned in BRIDGE_CONTRACT_VERSION; bumped on
 * breaking changes.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export const BRIDGE_CONTRACT_VERSION = "risk-assessment.v1";

const HMAC_HEADER = "x-ra-bridge-signature";
const TIMESTAMP_HEADER = "x-ra-bridge-timestamp";
const ORG_HEADER = "x-ra-bridge-org";
const USER_EMAIL_HEADER = "x-ra-bridge-user-email";
const CALLER_HEADER = "x-ra-bridge-caller";
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type BridgeAuthResult = {
  mode: "service" | "session";
  organizationId: string;
  userId: string | null;
  serviceCaller?: string;
};

export class BridgeAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
  ) {
    super(message);
    this.name = "BridgeAuthError";
  }
}

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

async function verifyServiceRequest(
  req: Request,
  rawBody: string,
): Promise<{ organizationId: string; userId: string | null; serviceCaller: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new BridgeAuthError("Missing bearer token", 401);
  }
  const presentedToken = authHeader.slice("Bearer ".length).trim();
  const expectedToken = process.env.RA_BRIDGE_TOKEN;
  if (!expectedToken) {
    throw new BridgeAuthError(
      "Server misconfigured: RA_BRIDGE_TOKEN missing",
      500,
    );
  }
  const a = Buffer.from(presentedToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BridgeAuthError("Invalid bearer token", 401);
  }

  const ts = req.headers.get(TIMESTAMP_HEADER);
  if (!ts) throw new BridgeAuthError(`Missing ${TIMESTAMP_HEADER}`, 401);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    throw new BridgeAuthError("Invalid timestamp", 401);
  }
  if (Math.abs(Date.now() - tsNum) > CLOCK_SKEW_MS) {
    throw new BridgeAuthError(
      `Timestamp outside ${CLOCK_SKEW_MS}ms skew window`,
      401,
    );
  }

  const presentedSig = req.headers.get(HMAC_HEADER);
  if (!presentedSig) throw new BridgeAuthError(`Missing ${HMAC_HEADER}`, 401);
  const hmacSecret = process.env.RA_BRIDGE_HMAC;
  if (!hmacSecret) {
    throw new BridgeAuthError(
      "Server misconfigured: RA_BRIDGE_HMAC missing",
      500,
    );
  }
  const expectedSig = createHmac("sha256", hmacSecret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  const sigA = Buffer.from(presentedSig);
  const sigB = Buffer.from(expectedSig);
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    throw new BridgeAuthError("HMAC signature mismatch", 401);
  }

  const orgHeader = req.headers.get(ORG_HEADER);
  if (!orgHeader) throw new BridgeAuthError(`Missing ${ORG_HEADER}`, 401);
  const resolvedOrgId = await resolveOrganizationId(orgHeader);
  if (!resolvedOrgId) {
    throw new BridgeAuthError(
      `Unknown organization in ${ORG_HEADER}`,
      401,
    );
  }

  const userEmailHeader = req.headers.get(USER_EMAIL_HEADER);
  const userId = userEmailHeader
    ? await resolveUserIdByEmail(userEmailHeader)
    : null;

  return {
    organizationId: resolvedOrgId,
    userId,
    serviceCaller: req.headers.get(CALLER_HEADER) ?? "mactech-training",
  };
}

/**
 * Authorize an inbound /api/risk-assessments/* request, supporting both
 * service-mode (HMAC bearer) and session-mode (Clerk user). Routes
 * call this at the top.
 *
 * Pass the rawBody (string from req.text()) so HMAC verification can
 * hash the exact bytes the client signed. Re-parse JSON via
 * `z.parse(JSON.parse(rawBody))` on the same string.
 */
export async function authorizeRiskRequest(
  req: Request,
  rawBody: string,
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

export function bridgeErrorResponse(e: unknown): NextResponse {
  if (e instanceof BridgeAuthError) {
    return NextResponse.json(
      { error: e.message, contractVersion: BRIDGE_CONTRACT_VERSION },
      { status: e.statusCode },
    );
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: e.issues,
        contractVersion: BRIDGE_CONTRACT_VERSION,
      },
      { status: 400 },
    );
  }
  const msg = e instanceof Error ? e.message : "Internal error";
  const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
  return NextResponse.json(
    { error: msg, contractVersion: BRIDGE_CONTRACT_VERSION },
    { status },
  );
}

export async function logRaAuditEvent(opts: {
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
    console.error("[risk-assessment] logRaAuditEvent failed:", e);
  }
}

// ============== Zod contract ==============

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const ImpactSchema = z.enum(["low", "moderate", "high", "critical"]);
export const LikelihoodSchema = z.enum([
  "rare",
  "unlikely",
  "possible",
  "likely",
  "almost_certain",
]);
export const TreatmentSchema = z.enum(["mitigate", "accept", "transfer", "avoid"]);

/**
 * POST /api/risk-assessments — create.
 * TrainOS calls this once when the customer starts a new assessment.
 * Returns { id, assessmentPivotId } that TrainOS should remember and
 * include on every subsequent call for this assessment.
 */
export const CreateAssessmentSchema = z
  .object({
    boundaryId: z.string().uuid(),
    /**
     * If TrainOS already knows the pivot id (e.g. it generated the UUID
     * itself), it can supply it here. Otherwise Codex generates one.
     */
    assessmentPivotId: z.string().uuid().optional(),
    /** Human-readable assessment name (e.g. "FY26 Annual RA — CUI Vault"). */
    assessmentName: z.string().min(1).max(255).optional(),
    organizationName: z.string().min(1).max(255).optional(),
    systemName: z.string().min(1).max(255).optional(),
    /** Boundary label scoping the assessment, distinct from systemName. */
    systemBoundaryName: z.string().min(1).max(255).optional(),
    /** SSP section/version this assessment is anchored to. */
    sspReference: z.string().min(1).max(500).optional(),
    scopeType: z.enum(["enterprise", "enclave", "system"]).optional(),
    methodology: z.string().min(2).max(255).optional(),
    definedFrequencyDays: z.number().int().positive().max(366).optional(),
    /**
     * WHY this cadence was chosen — defensibility narrative for
     * objective [a]. The C3PAO asks "why annual?" and this is the
     * answer that gets quoted back.
     */
    frequencyRationale: z.string().min(1).max(4000).optional(),
    reviewPeriodStart: z.string().regex(ISO_DATE).optional(),
    reviewPeriodEnd: z.string().regex(ISO_DATE).optional(),
    assessorDisplayName: z.string().min(2).max(255).optional(),
  })
  .strict();

/**
 * PATCH /api/risk-assessments/[id] — update non-terminal fields.
 * Refused if the row is finalized or superseded.
 */
export const UpdateAssessmentSchema = z
  .object({
    assessmentName: z.string().min(1).max(255).optional(),
    organizationName: z.string().min(1).max(255).optional(),
    systemName: z.string().min(1).max(255).optional(),
    systemBoundaryName: z.string().min(1).max(255).optional(),
    sspReference: z.string().min(1).max(500).optional(),
    scopeType: z.enum(["enterprise", "enclave", "system"]).optional(),
    methodology: z.string().min(2).max(255).optional(),
    definedFrequencyDays: z.number().int().positive().max(366).optional(),
    frequencyRationale: z.string().min(1).max(4000).optional(),
    reviewPeriodStart: z.string().regex(ISO_DATE).optional(),
    reviewPeriodEnd: z.string().regex(ISO_DATE).optional(),
    assessorDisplayName: z.string().min(2).max(255).optional(),
    reviewerDisplayName: z.string().min(2).max(255).optional(),
    approverDisplayName: z.string().min(2).max(255).optional(),
    /**
     * Lifecycle transitions allowed via PATCH:
     *   draft → in_progress → ready_for_review → reviewed →
     *   ready_for_approval → approved
     * The terminal states (finalized, superseded) and 'overdue' are
     * computed; PATCH refuses them.
     */
    status: z
      .enum([
        "draft",
        "in_progress",
        "ready_for_review",
        "reviewed",
        "ready_for_approval",
        "approved",
      ])
      .optional(),
  })
  .strict();

/**
 * POST /api/risk-assessments/[id]/risks — bulk upsert risks.
 *
 * Each risk maps to one row in governance_register_entries with
 * entryType='risk_identified', registerKey='risk_register', pivoted
 * by entryData.assessment_id.
 *
 * Boundary discipline: this endpoint accepts the SANITIZED narrative
 * fields TrainOS chose to share. Codex does NOT validate the
 * narratives — TrainOS is the source of truth. It DOES enforce field
 * presence and enum values so a schema-drift can't slip into the DB.
 */
export const RiskItemSchema = z
  .object({
    riskExternalId: z.string().min(1).max(64),
    scenarioId: z.string().min(1).max(128),
    riskStatement: z.string().min(10).max(4000),
    likelihood: LikelihoodSchema,
    impact: ImpactSchema,
    existingControls: z.array(z.string().max(200)).max(50).default([]),
    treatment: TreatmentSchema,
    owner: z.string().min(2).max(255),
    targetDate: z.string().regex(ISO_DATE).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    threatSource: z.string().max(255).optional(),
    vulnerability: z.string().max(2000).optional(),

    // ── Defensibility / enrichment fields (v1.1, additive) ────────
    // Codex stores these in entry_data as-is; the registers UI surfaces
    // them inline so adjudication doesn't have to crack the vault zip
    // open just to see why a risk was scored / treated the way it was.

    /** L (1-5) at the inherent (pre-control) layer. */
    inherentLikelihood: z.number().int().min(1).max(5).optional(),
    /** I (1-5) at the inherent (pre-control) layer. */
    inherentImpact: z.number().int().min(1).max(5).optional(),
    /** L*I (1-25) inherent score. */
    inherentRisk: z.number().int().min(1).max(25).optional(),
    /** L (1-5) after the existing controls land. */
    residualLikelihood: z.number().int().min(1).max(5).optional(),
    /** I (1-5) after the existing controls land. */
    residualImpact: z.number().int().min(1).max(5).optional(),
    /** L*I (1-25) residual score. */
    residualRisk: z.number().int().min(1).max(25).optional(),
    /** Bucket the residual maps into. The risk_register summary template
     * renders {{risk_rating}} — we mirror this string to risk_rating in
     * entry_data so the rendering pipeline picks it up. */
    severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional(),
    /** Auditor-readable rating ("HIGH", "MODERATE: 9/25", etc.). */
    riskRating: z.string().min(1).max(64).optional(),
    /** How effective the existing controls are at the residual layer. */
    controlEffectiveness: z
      .enum(["strong", "moderate", "weak", "absent"])
      .optional(),

    /** WHY mitigate / transfer / accept / avoid was chosen — defensibility. */
    treatmentRationale: z.string().max(4000).optional(),
    /** ACCEPT — full executive acceptance rationale. ≥40 chars. */
    acceptanceRationale: z.string().max(4000).optional(),
    /** ACCEPT — when the acceptance is reviewed next. YYYY-MM-DD. */
    acceptanceReviewDate: z.string().regex(ISO_DATE).optional(),
    /** ACCEPT — name of the executive who signed the acceptance. */
    acceptanceApproverDisplayName: z.string().max(255).optional(),
    /** TRANSFER — what carries the risk (insurance / MSA / clause ref). */
    transferMechanism: z.string().max(2000).optional(),
    /** AVOID — what the org stops doing to remove the risk. */
    avoidanceDescription: z.string().max(2000).optional(),

    /** NIST SP 800-30 Rev 1 Table H-1 impact narratives. Five domains. */
    impactOperations: z.string().max(2000).optional(),
    impactMission: z.string().max(2000).optional(),
    impactImageReputation: z.string().max(2000).optional(),
    impactAssets: z.string().max(2000).optional(),
    impactIndividuals: z.string().max(2000).optional(),

    /** Which CMMC controls this risk implicates (for register cross-ref). */
    relevantCmmcControls: z.array(z.string().max(64)).max(50).optional(),
    /** Provenance — pre-authored library scenario key, if any. */
    libraryScenarioKey: z.string().max(128).nullable().optional(),
  })
  .strict();

export const RisksUpsertSchema = z
  .object({
    risks: z.array(RiskItemSchema).min(1).max(500),
  })
  .strict();

/**
 * POST /api/risk-assessments/[id]/finalize — terminal lock.
 *
 * Hashes are required:
 *   - finalReportSha256 always (the cover PDF or signed report)
 *   - packageSha256 always (the full ZIP TrainOS produced)
 *   - evidenceManifestSha256 optional (for vault-mode deployments)
 *
 * vault_artifact_pointer is required IF the deployment is in
 * vault-mode (configured per-org). This bridge endpoint accepts it
 * and the schema CHECK validates it later if the deployment requires.
 */
export const FinalizeSchema = z
  .object({
    finalReportSha256: z.string().regex(SHA256_HEX),
    packageSha256: z.string().regex(SHA256_HEX),
    evidenceManifestSha256: z.string().regex(SHA256_HEX).optional(),
    vaultArtifactPointer: z.string().min(1).optional(),
    immutableManifestPointer: z.string().min(1).optional(),
    overrideObjectiveBNotApplicable: z.boolean().optional(),
  })
  .strict();
