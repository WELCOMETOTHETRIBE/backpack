import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

/**
 * Auth helper for endpoints that accept EITHER a session (human user
 * uploading via the dashboard) OR a long-lived bearer token (the
 * MacTech EnclaveWatch service running unattended on a customer's
 * vault). Tried in order: session first, then bearer.
 *
 * Bearer flow:
 *   - Authorization: Bearer <token>
 *   - Token is matched against organizations.enclavewatch_api_token
 *   - If matched, the request runs as that org with no user identity
 *
 * Returns the resolved organizationId, or null if neither path succeeds.
 * Callers respond with 401 on null. Use this in any endpoint that
 * EnclaveWatch is expected to hit on cadence: /api/evidence/v2/ingest,
 * /api/os-baselines/.../import-report, /api/enclavewatch/weekly-review/ingest.
 */
export async function resolveOrgFromSessionOrBearer(
  req: Request,
): Promise<{ orgId: string; via: "session" | "bearer" } | null> {
  // Session path first (covers manual uploads + the existing dashboard
  // flows). If a logged-in session resolves an org, prefer it -- the
  // user identity is more useful for audit logging than an anonymous
  // service token.
  const session = await auth();
  const sessionOrgId = (session?.user as { organizationId?: string })
    ?.organizationId;
  if (sessionOrgId) return { orgId: sessionOrgId, via: "session" };

  // Bearer path for unattended services. The token resolves the org
  // server-side -- the caller never has to know the orgId.
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.enclavewatchApiToken, token))
    .limit(1);
  if (!org) return null;

  return { orgId: org.id, via: "bearer" };
}
