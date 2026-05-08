/**
 * QMS CMMC contract client (codex side, server-only).
 *
 * Reads `QMS_INTEGRATION_CLIENT_ID` + `QMS_INTEGRATION_CLIENT_SECRET` from
 * Railway env, mints a 10-min HS256 JWT via the QMS client-credentials
 * endpoint, and calls the v2.1-locked contract at:
 *
 *   GET /api/v1/cmmc/controls/:controlId/documents
 *   GET /api/v1/cmmc/controls/documents?control_ids=…
 *
 * In-memory caches (process-scoped):
 *   - token: refreshed when within 30s of expiry
 *   - bulk endpoint: 5 min (per request shape)
 *   - per-control endpoint: 2 min
 *
 * Failures never throw to callers. Every public function returns `null` on
 * any unexpected condition — auth failure, network error, schema mismatch,
 * 5xx — so calling pages render a graceful "QMS unreachable" state.
 *
 * NEVER imported from a client component or browser module. Credentials
 * leak if this lands in a bundle that ships to the browser.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// contract schemas (mirror server/src/lib/cmmc/governanceContractSchemas.js
// on the QMS side; bumped when QMS publishes a new contract version)
// ─────────────────────────────────────────────────────────────────────────────

export const docKindSchema = z.enum([
  "policy",
  "procedure",
  "sop",
  "plan",
  "form",
  "reference",
  "other",
]);

export const sourceSchema = z.enum(["qms_managed", "cmmc_bundle"]);

export const approvalStatusSchema = z.enum([
  "effective",
  "pending",
  "draft",
  "retired",
]);

export const reviewCycleStatusSchema = z.enum([
  "current",
  "due_soon",
  "overdue",
  "expired",
]);

export const controlCoverageStatusSchema = z.enum([
  "complete",
  "partial",
  "absent",
]);

const isoDateString = z.string().datetime({ offset: true });

export const contractDocumentSchema = z.object({
  doc_id: z.string(),
  doc_uuid: z.string(),
  source: sourceSchema,
  title: z.string(),
  doc_kind: docKindSchema,
  qms_doc_type: z.string(),
  current_version: z.string().nullable(),
  current_version_effective_date: isoDateString.nullable(),
  last_reviewed_at: isoDateString.nullable(),
  next_review_due_at: isoDateString.nullable(),
  cadence_label: z.string().nullable(),
  review_cycle_status: reviewCycleStatusSchema,
  approver_name: z.string().nullable(),
  approval_status: approvalStatusSchema,
  qms_native_status: z.string(),
  permalink: z.string().url(),
  control_coverage_note: z.string().nullable(),
});

export const controlSummarySchema = z.object({
  documents_present: z.number().int().nonnegative(),
  documents_current: z.number().int().nonnegative(),
  documents_due_soon: z.number().int().nonnegative(),
  documents_overdue: z.number().int().nonnegative(),
  control_coverage_status: controlCoverageStatusSchema,
});

export const perControlResponseSchema = z.object({
  control_id: z.string(),
  documents: z.array(contractDocumentSchema),
  summary: controlSummarySchema,
});

export const bulkResponseSchema = z.object({
  controls: z.array(
    z.object({
      control_id: z.string(),
      summary: controlSummarySchema,
    })
  ),
});

export type ContractDocument = z.infer<typeof contractDocumentSchema>;
export type ControlSummary = z.infer<typeof controlSummarySchema>;
export type PerControlResponse = z.infer<typeof perControlResponseSchema>;
export type BulkResponse = z.infer<typeof bulkResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// config
// ─────────────────────────────────────────────────────────────────────────────

const QMS_BASE = (
  process.env.QMS_API_BASE_URL ?? "https://quality.mactechsolutionsllc.com"
).replace(/\/+$/, "");
const CLIENT_ID = process.env.QMS_INTEGRATION_CLIENT_ID;
const CLIENT_SECRET = process.env.QMS_INTEGRATION_CLIENT_SECRET;

const TOKEN_REFRESH_SKEW_MS = 30_000;
const BULK_TTL_MS = 5 * 60 * 1000;
const PER_CONTROL_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// token cache (process-scoped; one per Node worker)
// ─────────────────────────────────────────────────────────────────────────────

interface TokenEntry {
  value: string;
  expiresAt: number; // epoch ms
}
let tokenEntry: TokenEntry | null = null;
let inFlightTokenMint: Promise<string | null> | null = null;

async function mintToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "[qms-client] QMS_INTEGRATION_CLIENT_ID / _CLIENT_SECRET not set — cannot mint token"
    );
    return null;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${QMS_BASE}/api/integrations/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(`[qms-client] token mint failed: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token || typeof body.expires_in !== "number") {
      console.error("[qms-client] token mint: malformed response");
      return null;
    }
    tokenEntry = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  } catch (err) {
    console.error("[qms-client] token mint threw:", err);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (tokenEntry && tokenEntry.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return tokenEntry.value;
  }
  // Coalesce concurrent refresh attempts.
  if (!inFlightTokenMint) {
    inFlightTokenMint = mintToken().finally(() => {
      inFlightTokenMint = null;
    });
  }
  return inFlightTokenMint;
}

// ─────────────────────────────────────────────────────────────────────────────
// response caches (process-scoped)
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const bulkCache = new Map<string, CacheEntry<BulkResponse>>();
const perControlCache = new Map<string, CacheEntry<PerControlResponse>>();

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): void {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

async function authedFetch(
  path: string,
  retried = false
): Promise<unknown | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${QMS_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.status === 401 && !retried) {
      // Token may have been revoked or rotated — drop cache + retry once.
      tokenEntry = null;
      return authedFetch(path, true);
    }
    if (res.status === 404) return { __notFound: true };
    if (!res.ok) {
      console.error(`[qms-client] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[qms-client] ${path} threw:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch federated documents + summary for one control. Used by the
 * /dashboard/adjudication/governance/[controlId] detail page.
 *
 * Returns:
 *   - the parsed envelope on success
 *   - `{ control_id, documents: [], summary: { ..., absent } }` on 404
 *     (codex treats unknown control_id as "no docs tagged")
 *   - `null` on any other failure (auth, network, schema mismatch)
 */
export async function getControlDocuments(
  controlId: string
): Promise<PerControlResponse | null> {
  const cached = getCached(perControlCache, controlId);
  if (cached) return cached;

  const json = await authedFetch(
    `/api/v1/cmmc/controls/${encodeURIComponent(controlId)}/documents`
  );
  if (json == null) return null;

  // 404 → synthesized absent envelope (per contract)
  if (
    typeof json === "object" &&
    (json as { __notFound?: boolean }).__notFound
  ) {
    const empty: PerControlResponse = {
      control_id: controlId,
      documents: [],
      summary: {
        documents_present: 0,
        documents_current: 0,
        documents_due_soon: 0,
        documents_overdue: 0,
        control_coverage_status: "absent",
      },
    };
    setCached(perControlCache, controlId, empty, PER_CONTROL_TTL_MS);
    return empty;
  }

  const parsed = perControlResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `[qms-client] per-control schema mismatch for ${controlId}:`,
      parsed.error.format()
    );
    return null;
  }
  setCached(perControlCache, controlId, parsed.data, PER_CONTROL_TTL_MS);
  return parsed.data;
}

/**
 * Fetch summary-only response for many controls. Used by the
 * /dashboard/adjudication/governance list page.
 *
 * Cap is 50 ids per request (enforced by QMS). The cache key is the joined
 * sorted list — repeated calls with the same id set hit the cache.
 *
 * Returns null on any failure (no synthetic empty for bulk — the list page
 * can render a degraded state).
 */
export async function getControlSummaries(
  controlIds: string[]
): Promise<BulkResponse | null> {
  if (!Array.isArray(controlIds) || controlIds.length === 0) return null;
  if (controlIds.length > 50) {
    console.error("[qms-client] bulk request exceeds 50-id cap");
    return null;
  }
  // Cache key independent of order, but the API echoes order — so we
  // request in sorted order then re-sort the response to match the
  // caller's input order.
  const sortedKey = [...controlIds].sort().join(",");
  const cached = getCached(bulkCache, sortedKey);
  if (cached) {
    return reorder(cached, controlIds);
  }

  const json = await authedFetch(
    `/api/v1/cmmc/controls/documents?control_ids=${encodeURIComponent(sortedKey)}`
  );
  if (
    json == null ||
    (typeof json === "object" && (json as { __notFound?: boolean }).__notFound)
  ) {
    return null;
  }

  const parsed = bulkResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(
      "[qms-client] bulk schema mismatch:",
      parsed.error.format()
    );
    return null;
  }
  setCached(bulkCache, sortedKey, parsed.data, BULK_TTL_MS);
  return reorder(parsed.data, controlIds);
}

function reorder(bulk: BulkResponse, requested: string[]): BulkResponse {
  const byId = new Map(bulk.controls.map((c) => [c.control_id, c]));
  const ordered: BulkResponse["controls"] = [];
  for (const id of requested) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return { controls: ordered };
}

/**
 * Test/admin only: clear all process-scoped caches. Production code never
 * needs this; the TTLs are short enough that staleness is bounded.
 */
export function _clearQmsClientCaches(): void {
  tokenEntry = null;
  bulkCache.clear();
  perControlCache.clear();
}
