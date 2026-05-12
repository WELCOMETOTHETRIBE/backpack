/**
 * Google Meet attendance bridge — service-to-service auth + Zod
 * contract for the Apps Script in scripts/google-meet-attendance/.
 *
 * Auth model mirrors the IR Tabletop bridge (src/lib/ir-tabletop-bridge.ts):
 *   - Bearer token (constant-time compare against GOOGLE_MEET_BRIDGE_TOKEN)
 *   - HMAC-SHA256 over `${timestamp}.${rawBody}` (header + secret)
 *   - 5-minute clock skew window for replay resistance
 *   - Org resolved server-side from X-GMeet-Bridge-Org header
 *
 * The Apps Script knows the customer's clerk_org_id (or Codex
 * organization uuid) at install time and sends it on every request.
 *
 * Env vars on Codex (Railway):
 *   GOOGLE_MEET_BRIDGE_TOKEN  — shared bearer secret
 *   GOOGLE_MEET_BRIDGE_HMAC   — shared HMAC secret (separate from bearer)
 *
 * Same secrets get pasted into the Apps Script's Script Properties:
 *   GOOGLE_MEET_BRIDGE_TOKEN
 *   GOOGLE_MEET_BRIDGE_HMAC
 *   CODEX_ORG_ID  (the customer's organizations.id or clerk_org_id)
 *   CODEX_BASE_URL (e.g. https://codex.mactechsolutionsllc.com)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";

export const BRIDGE_CONTRACT_VERSION = "google-meet-attendance.v1";
const HMAC_HEADER = "x-gmeet-bridge-signature";
const TIMESTAMP_HEADER = "x-gmeet-bridge-timestamp";
const ORG_HEADER = "x-gmeet-bridge-org";
const CALLER_HEADER = "x-gmeet-bridge-caller";
const USER_EMAIL_HEADER = "x-gmeet-bridge-user-email";
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export class BridgeAuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = "BridgeAuthError";
  }
}

async function resolveOrganizationId(input: string): Promise<string | null> {
  if (input.startsWith("org_")) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, input))
      .limit(1);
    return row?.id ?? null;
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  ) {
    return null;
  }
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, input))
    .limit(1);
  return row?.id ?? null;
}

export interface BridgeAuthResult {
  organizationId: string;
  caller: string;
  userEmail: string | null;
}

/**
 * Verify an inbound Apps Script request. Returns the resolved org id
 * + caller name (for audit logging). Throws BridgeAuthError on any
 * auth failure — route catches, returns the standard error envelope.
 */
export async function verifyGoogleMeetRequest(
  req: Request,
  rawBody: string,
): Promise<BridgeAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new BridgeAuthError("Missing bearer token");
  }
  const presentedToken = authHeader.slice("Bearer ".length).trim();
  const expectedToken = process.env.GOOGLE_MEET_BRIDGE_TOKEN;
  if (!expectedToken) {
    throw new BridgeAuthError(
      "Server misconfigured: GOOGLE_MEET_BRIDGE_TOKEN missing",
      500,
    );
  }
  const a = Buffer.from(presentedToken);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BridgeAuthError("Invalid bearer token");
  }

  const ts = req.headers.get(TIMESTAMP_HEADER);
  if (!ts) throw new BridgeAuthError(`Missing ${TIMESTAMP_HEADER}`);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) throw new BridgeAuthError("Invalid timestamp");
  const skew = Math.abs(Date.now() - tsNum);
  if (skew > CLOCK_SKEW_MS) {
    throw new BridgeAuthError(
      `Timestamp outside ${CLOCK_SKEW_MS}ms skew window`,
    );
  }

  const presentedSig = req.headers.get(HMAC_HEADER);
  if (!presentedSig) throw new BridgeAuthError(`Missing ${HMAC_HEADER}`);
  const hmacSecret = process.env.GOOGLE_MEET_BRIDGE_HMAC;
  if (!hmacSecret) {
    throw new BridgeAuthError(
      "Server misconfigured: GOOGLE_MEET_BRIDGE_HMAC missing",
      500,
    );
  }
  const expectedSig = createHmac("sha256", hmacSecret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  const sigA = Buffer.from(presentedSig);
  const sigB = Buffer.from(expectedSig);
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    throw new BridgeAuthError("HMAC signature mismatch");
  }

  const orgHeader = req.headers.get(ORG_HEADER);
  if (!orgHeader) throw new BridgeAuthError(`Missing ${ORG_HEADER}`);
  const resolvedOrgId = await resolveOrganizationId(orgHeader);
  if (!resolvedOrgId) {
    throw new BridgeAuthError(`Unknown organization in ${ORG_HEADER}`);
  }

  return {
    organizationId: resolvedOrgId,
    caller: req.headers.get(CALLER_HEADER) ?? "google-meet-apps-script",
    userEmail: req.headers.get(USER_EMAIL_HEADER) ?? null,
  };
}

// ============== Zod contract — request shape ==============

const IsoDateTimeSchema = z.string().datetime();
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected lowercase hex sha256");

export const AttendeeSchema = z.object({
  name: z.string().min(1).max(255),
  // Google Meet sometimes lists external attendees with no resolvable
  // email (dial-in or anonymous join). Keep nullable to capture them.
  email: z.string().email().nullable().optional().transform((v) => v ?? null),
  joinTimeIso: IsoDateTimeSchema.nullable().optional().transform((v) => v ?? null),
  leaveTimeIso: IsoDateTimeSchema.nullable().optional().transform((v) => v ?? null),
  durationMinutes: z.number().int().nonnegative().nullable().optional().transform((v) => v ?? null),
  // Google Meet exposes participant_role in the new attendance report
  // format ("HOST" | "PARTICIPANT" | etc). Free-form string here so
  // we don't need to chase Google's enum changes.
  role: z.string().max(64).nullable().optional().transform((v) => v ?? null),
});
export type Attendee = z.infer<typeof AttendeeSchema>;

export const GoogleMeetAttendancePayloadSchema = z.object({
  meetingTitle: z.string().min(1).max(500),
  meetingStartedAt: IsoDateTimeSchema,
  meetingEndedAt: IsoDateTimeSchema.optional(),
  meetingDurationMinutes: z.number().int().nonnegative().optional(),

  driveFileId: z.string().min(1).max(255),
  driveFileUrl: z.string().url(),
  driveFileName: z.string().max(500).optional(),
  driveFileSha256: Sha256Schema.optional(),

  attendees: z.array(AttendeeSchema).min(0).max(500),
});
export type GoogleMeetAttendancePayload = z.infer<
  typeof GoogleMeetAttendancePayloadSchema
>;

// ============== Tag parser ==============

/**
 * Parses [CDX-{kind}-{8charHexPrefix}] from the meeting title.
 *
 * Examples that match:
 *   "Q4 2026 IR Tabletop [CDX-IR-a1b2c3d4]"
 *   "Risk Assessment Review [CDX-RA-deadbeef]"
 *   "CA Bundle Walkthrough — [CDX-CA-12345678]"
 *
 * Returns null for titles without a tag — those become unmatched
 * imports the operator can reconcile manually from the dashboard.
 */
export function parseAssessmentTag(meetingTitle: string): {
  kind: "ir_tabletop" | "ra" | "ca";
  idPrefix: string;
  raw: string;
} | null {
  const match = meetingTitle.match(/\[CDX-(IR|RA|CA)-([0-9a-f]{8})\]/i);
  if (!match) return null;
  const kindMap: Record<string, "ir_tabletop" | "ra" | "ca"> = {
    ir: "ir_tabletop",
    ra: "ra",
    ca: "ca",
  };
  return {
    kind: kindMap[match[1].toLowerCase()],
    idPrefix: match[2].toLowerCase(),
    raw: match[0],
  };
}
