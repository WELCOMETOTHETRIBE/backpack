/**
 * MacTech Identity — Audit log client (drop-in, dependency-free).
 *
 * Sends a single audit event to the central Identity Command Center hub at
 * `${MACTECH_IDENTITY_BASE_URL}/api/audit/ingest`, authenticated with
 * `MACTECH_AUDIT_INGEST_API_KEY`. Schema mirrors the Zod schema defined in
 * mactech-suite-platform/lib/validations/audit.ts.
 *
 * Usage (server-side only — never expose the API key to the browser):
 *
 *   import { sendAuditLog } from "@/lib/mactech-audit-client";
 *
 *   await sendAuditLog({
 *     appKey: "training",
 *     eventType: "training.course.completed",
 *     eventCategory: "system",
 *     severity: "info",
 *     action: "Completed Annual CUI Awareness training",
 *     customerOrgClerkId: clerkOrgId,
 *     actorClerkUserId: userId,
 *     resourceType: "course_completion",
 *     resourceId: completionId,
 *     metadata: { courseSlug, score, durationSec },
 *   });
 *
 * Failures never throw upstream — they are logged to console.error so a
 * downstream outage in the Identity Command Center cannot take down sibling
 * apps. If you need stricter delivery semantics, set `throwOnError: true`.
 */

export type AuditCategory =
  | "auth"
  | "user"
  | "org"
  | "entitlement"
  | "role"
  | "security"
  | "vault"
  | "evidence"
  | "boundary"
  | "capture"
  | "system";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditIngestPayload {
  /** Stable AppRegistry.appKey — must already exist in the central hub. */
  appKey: string;
  /** Dotted event-type identifier, e.g. "vault.file.downloaded". */
  eventType: string;
  eventCategory?: AuditCategory;
  severity?: AuditSeverity;
  /** Human-readable past-tense description, e.g. "Downloaded encrypted CUI file". */
  action: string;
  /** Either MacTech CustomerOrganization.id OR clerkOrgId — both work. */
  customerOrgId?: string;
  customerOrgClerkId?: string;
  actorClerkUserId?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  /** Arbitrary JSON-serializable metadata. Secrets are auto-redacted server-side. */
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface SendAuditLogOptions {
  payload: AuditIngestPayload;
  baseUrl?: string;
  apiKey?: string;
  throwOnError?: boolean;
  signal?: AbortSignal;
  /** Override fetch — useful in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Resolves the base URL from `MACTECH_IDENTITY_BASE_URL` (server env), with a
 * production fallback. Never falls back to the test environment automatically.
 */
function resolveBaseUrl(explicit?: string): string {
  return (
    explicit ??
    process.env.MACTECH_IDENTITY_BASE_URL ??
    "https://www.suite.mactechsolutionsllc.com"
  );
}

function resolveApiKey(explicit?: string): string | undefined {
  return explicit ?? process.env.MACTECH_AUDIT_INGEST_API_KEY;
}

export async function sendAuditLog(opts: SendAuditLogOptions): Promise<{ id?: string; ok: boolean }> {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const apiKey = resolveApiKey(opts.apiKey);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    const msg = "[mactech-audit] MACTECH_AUDIT_INGEST_API_KEY is not configured; skipping send.";
    if (opts.throwOnError) throw new Error(msg);
    console.warn(msg);
    return { ok: false };
  }

  const url = new URL("/api/audit/ingest", baseUrl).toString();
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MacTech-Audit-Key": apiKey,
      },
      body: JSON.stringify(opts.payload),
      signal: opts.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `[mactech-audit] ${opts.payload.eventType} → ${res.status} ${text.slice(0, 200)}`;
      if (opts.throwOnError) throw new Error(msg);
      console.error(msg);
      return { ok: false };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id };
  } catch (err) {
    if (opts.throwOnError) throw err;
    console.error(`[mactech-audit] send failed for ${opts.payload.eventType}:`, err);
    return { ok: false };
  }
}

/**
 * Fire-and-forget variant. Returns immediately. Intended for use inside
 * Next.js middleware or hot paths where the request must not wait on the
 * audit hub. Errors are swallowed to console.
 */
export function sendAuditLogAsync(opts: SendAuditLogOptions): void {
  void sendAuditLog(opts);
}
