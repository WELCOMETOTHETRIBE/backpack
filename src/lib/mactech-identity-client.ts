/**
 * MacTech Identity client (drop-in, dependency-free).
 *
 * Asks the central Identity Command Center hub at
 * `${MACTECH_IDENTITY_BASE_URL}/api/v1/users/{clerkUserId}/access` whether
 * a Clerk user has access to THIS app via any of their customer-org
 * memberships. Returns a structured access record on yes, null on no.
 *
 * Auth: same `MACTECH_AUDIT_INGEST_API_KEY` used by the audit client. The
 * key needs the `user_access_read` scope (or be the legacy env-var key
 * which carries all scopes for backward compatibility).
 *
 * Pattern: each sibling app calls `checkIdentityAccess` from its auth
 * middleware. On a hit, it JIT-creates (or refreshes) the local user row
 * and lets the request through. On a miss, it returns the structured
 * response so the caller can render an "ask your admin" 403 page that
 * deep-links to the central admin UI.
 *
 * Failure mode: if the ICC is unreachable, this returns
 * { ok: false, transient: true } so the calling app can either fail
 * closed (recommended for security-sensitive apps like vault/QMS) or
 * fall back to its existing local-only check.
 */

export interface IdentityOrgAccess {
  orgId: string;
  clerkOrgId: string | null;
  orgName: string;
  orgStatus: string;
  memberStatus: "active" | "suspended" | "invited";
  /** Local MacTech customer role for the user in that org. */
  role: string;
  /** Permission strings granted to this role in this org. */
  permissions: string[];
  /** App entitlements that are CURRENTLY enabled for this org. */
  enabledApps: Array<{
    appKey: string;
    appName: string;
    plan: string;
    status: string;
    expiresAt: string | null;
  }>;
}

export interface IdentityUser {
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isInternalMacTechUser: boolean;
  platformRole: string;
  status: "active" | "suspended" | "invited";
}

export type IdentityAccessResult =
  | { ok: true; user: IdentityUser; orgs: IdentityOrgAccess[] }
  | { ok: false; reason: "user_not_found" | "unauthorized" | "transient"; status?: number };

export interface CheckIdentityAccessOptions {
  clerkUserId: string;
  /** Filter to a specific app — only orgs entitled to this app will be returned. */
  appKey?: string;
  /** Filter to a specific Clerk org id. */
  clerkOrgId?: string;
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Defaults to 5 seconds; raises on timeout. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://www.suite.mactechsolutionsllc.com";

function resolveBaseUrl(explicit?: string): string {
  return explicit ?? process.env.MACTECH_IDENTITY_BASE_URL ?? DEFAULT_BASE_URL;
}

function resolveApiKey(explicit?: string): string | undefined {
  return explicit ?? process.env.MACTECH_AUDIT_INGEST_API_KEY;
}

/**
 * Look up a user's access from the central Identity Command Center.
 * Returns a structured response covering all happy + unhappy paths so the
 * calling auth middleware can react appropriately without surprises.
 */
export async function checkIdentityAccess(
  opts: CheckIdentityAccessOptions,
): Promise<IdentityAccessResult> {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiKey = resolveApiKey(opts.apiKey);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    console.warn(
      "[mactech-identity] MACTECH_AUDIT_INGEST_API_KEY not configured; cannot reach ICC.",
    );
    return { ok: false, reason: "transient" };
  }

  const url = new URL(
    `/api/v1/users/${encodeURIComponent(opts.clerkUserId)}/access`,
    baseUrl,
  );
  if (opts.appKey) url.searchParams.set("appKey", opts.appKey);
  if (opts.clerkOrgId) url.searchParams.set("clerkOrgId", opts.clerkOrgId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  const signal = opts.signal ?? controller.signal;

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { "X-MacTech-Audit-Key": apiKey },
      signal,
    });
    if (res.status === 404) return { ok: false, reason: "user_not_found", status: 404 };
    if (res.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
    if (!res.ok) {
      console.error(`[mactech-identity] ICC returned ${res.status}`);
      return { ok: false, reason: "transient", status: res.status };
    }
    const body = (await res.json()) as { ok: boolean; user: IdentityUser; orgs: IdentityOrgAccess[] };
    return { ok: true, user: body.user, orgs: body.orgs };
  } catch (err) {
    console.error(`[mactech-identity] checkIdentityAccess failed:`, err);
    return { ok: false, reason: "transient" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience: returns the first org membership where the user has access
 * to `appKey` AND that org's status is active AND the user's membership
 * is active. Returns null if no such org exists.
 *
 * This is the helper most auth middlewares actually want. JIT-create the
 * local user row with the returned role; deny if null.
 */
export function findActiveAccessForApp(
  result: IdentityAccessResult,
  appKey: string,
): { user: IdentityUser; org: IdentityOrgAccess; entitlement: IdentityOrgAccess["enabledApps"][number] } | null {
  if (!result.ok) return null;
  if (result.user.status !== "active") return null;

  // Internal MacTech users always have access to every app — they are the
  // platform operators. The `orgs[]` array is empty for them by design.
  if (result.user.isInternalMacTechUser && result.user.status === "active") {
    return {
      user: result.user,
      org: {
        orgId: "mactech-internal",
        clerkOrgId: null,
        orgName: "MacTech Solutions",
        orgStatus: "active",
        memberStatus: "active",
        role: result.user.platformRole,
        permissions: [],
        enabledApps: [],
      },
      entitlement: {
        appKey,
        appName: appKey,
        plan: "internal",
        status: "active",
        expiresAt: null,
      },
    };
  }

  for (const org of result.orgs) {
    if (org.memberStatus !== "active") continue;
    // Onboarding orgs are legitimate — they've been created in the central
    // hub but the wizard isn't fully complete. Customer users should still
    // be able to sign in. Suspended/archived orgs are intentionally blocked.
    if (org.orgStatus !== "active" && org.orgStatus !== "onboarding") continue;
    const entitlement = org.enabledApps.find((e) => e.appKey === appKey);
    if (!entitlement) continue;
    if (entitlement.status !== "active" && entitlement.status !== "trialing") continue;
    return { user: result.user, org, entitlement };
  }
  return null;
}
