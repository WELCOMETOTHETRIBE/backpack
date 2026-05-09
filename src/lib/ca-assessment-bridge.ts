/**
 * CA Assessment bridge — service-to-service auth for the MacTech
 * Training → Codex push of CA.L2-3.12.{1,2,3,4} cycle bundle metadata.
 *
 * Mirrors src/lib/risk-assessment-bridge.ts; the auth shape is
 * identical except the env vars are CA_BRIDGE_TOKEN / CA_BRIDGE_HMAC
 * and the bridge headers are X-CA-Bridge-*. Different secrets per
 * bridge so a leak in one doesn't grant access to the others.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth";

export const BRIDGE_CONTRACT_VERSION = "ca-assessment.v1";
const HMAC_HEADER = "x-ca-bridge-signature";
const TIMESTAMP_HEADER = "x-ca-bridge-timestamp";
const ORG_HEADER = "x-ca-bridge-org";
const USER_EMAIL_HEADER = "x-ca-bridge-user-email";
const CALLER_HEADER = "x-ca-bridge-caller";
const CLOCK_SKEW_MS = 5 * 60 * 1000;

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
    await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
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
  const expectedToken = process.env.CA_BRIDGE_TOKEN;
  if (!expectedToken) {
    throw new BridgeAuthError("Server misconfigured: CA_BRIDGE_TOKEN missing", 500);
  }
  const a = Buffer.from(presentedToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BridgeAuthError("Invalid bearer token", 401);
  }

  const ts = req.headers.get(TIMESTAMP_HEADER);
  if (!ts) throw new BridgeAuthError(`Missing ${TIMESTAMP_HEADER}`, 401);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) throw new BridgeAuthError("Invalid timestamp", 401);
  if (Math.abs(Date.now() - tsNum) > CLOCK_SKEW_MS) {
    throw new BridgeAuthError(`Timestamp outside ${CLOCK_SKEW_MS}ms skew window`, 401);
  }

  const presentedSig = req.headers.get(HMAC_HEADER);
  if (!presentedSig) throw new BridgeAuthError(`Missing ${HMAC_HEADER}`, 401);
  const hmacSecret = process.env.CA_BRIDGE_HMAC;
  if (!hmacSecret) {
    throw new BridgeAuthError("Server misconfigured: CA_BRIDGE_HMAC missing", 500);
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
    throw new BridgeAuthError(`Unknown organization in ${ORG_HEADER}`, 401);
  }

  const userEmailHeader = req.headers.get(USER_EMAIL_HEADER);
  const userId = userEmailHeader ? await resolveUserIdByEmail(userEmailHeader) : null;

  return {
    organizationId: resolvedOrgId,
    userId,
    serviceCaller: req.headers.get(CALLER_HEADER) ?? "mactech-training",
  };
}

export async function authorizeCaRequest(
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

export async function logCaAuditEvent(opts: {
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
    console.error("[ca-bridge] logCaAuditEvent failed:", e);
  }
}

// ── Zod contract ──────────────────────────────────────────────────

const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Bundle-archive payload TrainOS sends after a CA cycle finalizes.
 * Mirrors the shape of vault-side CaAssessmentBundle's metadata fields.
 * Idempotent on (organization_id, cycle_id) — re-pushes update in
 * place.
 */
export const CaBundlePushSchema = z
  .object({
    cycleId: z.string().min(1).max(128),
    cycleTitle: z.string().min(1).max(500),
    cycleType: z.string().max(60).optional(),
    contentHash: z.string().regex(SHA256_HEX).optional(),
    packageSha256: z.string().regex(SHA256_HEX).optional(),
    manifestSha256: z.string().regex(SHA256_HEX).optional(),
    packageVersion: z.number().int().positive().optional(),
    finalizedAtUtc: z.string().datetime().optional(),
    retentionUntilUtc: z.string().datetime().optional(),
    controlIds: z.string().max(2000).optional(),
    /**
     * "CA.L2-3.12.1=MET,CA.L2-3.12.2=MET,..." — already in the
     * C3PAO-facing MET vocabulary. The canonical helper reads these
     * directly when projecting CA-family verdicts (Phase D follow-up).
     */
    controlVerdicts: z.string().max(2000).optional(),
    sspVersion: z.string().max(120).optional(),
    boundaryVersion: z.string().max(120).optional(),
    leadAssessor: z.string().max(255).optional(),
    reviewer: z.string().max(255).optional(),
    approver: z.string().max(255).optional(),
    sctmStatus: z.string().max(60).optional(),
    cui: z.boolean().optional(),
    vaultStorageUri: z.string().url().optional(),
    vaultStorageRegion: z.string().max(60).optional(),
  })
  .strict();
