/**
 * Phase 2-Codex-outbound: HTTP bridge from Codex → MacTech Quality QMS
 * for SSP doc-control submissions.
 *
 * Wire contract is the one specified in the QMS team's Phase 2 prompt
 * (see docs/CODEX_SSP_BRIDGE_PHASE2_RUNBOOK.md on the QMS side):
 *
 *   POST https://quality.mactechsolutionsllc.com/api/external-submissions/ssp
 *   Authorization: Bearer <SSP_DOC_CONTROL_BRIDGE_TOKEN>
 *   X-Codex-Signature: sha256=<hex-mac>      ← HMAC over the raw body
 *   Content-Type: application/json
 *
 * QMS verifies both. 202 on accept; 400/401/403/409/500 on errors. The
 * endpoint is idempotent on (organization_id, ssp_document_id,
 * payload_sha256) so re-POSTing after a transient failure is safe.
 *
 * Failure handling is best-effort: this helper never throws. Callers
 * that want to react to failures should inspect the returned shape's
 * `ok` flag and `reason` string. The /api/ssp/[id]/submit-to-doc-control
 * route persists the staging row first, then calls this helper, then
 * stamps the result back onto the staging row — so a failed POST
 * leaves the row in `submitted` state with `last_outbound_error`
 * populated, ready for retry.
 */
import { createHmac } from "node:crypto";

const QMS_BASE_URL =
  process.env.QMS_BRIDGE_BASE_URL ?? "https://quality.mactechsolutionsllc.com";
const QMS_PATH = "/api/external-submissions/ssp";
const BRIDGE_VERSION = "1";

export interface BridgeSignoffPayload {
  kind: "isso" | "system_owner" | "authorizing_official";
  signer_display_name: string;
  signer_title: string;
  data_hash: string;
  signed_at: string; // ISO8601
  signature_alg: string | null;
  signature_value: string | null;
}

/**
 * Author/submitter metadata. Distinct from signoffs[] — this is the
 * identity of the user who clicked "Generate" + transmitted the SSP
 * to QMS. NOT an approval signature; QMS's Reviewer/Approver/Quality
 * Release chain stays separate. Populates QMS's "Submitted by" field
 * so a doc detail page can show who authored the submission without
 * any conflict-of-duty concern about the author also signing as
 * approver.
 */
export interface BridgeAuthorPayload {
  user_id: string;
  display_name: string;
  email: string | null;
  /** ISO8601 — when the author triggered the submission. */
  attested_at: string;
  /** payload_sha256 the author transmitted, for integrity verification. */
  data_hash: string;
}

export interface BridgeRequestPayload {
  bridge_version: string;
  submission_id: string;
  organization_id: string;
  ssp_document_id: string;
  ssp_version_number: number;
  document_number: string;
  payload_sha256: string;
  generated_at: string;
  generated_from_snapshot_at: string;
  boundary_id: string;
  boundary_name: string;
  /**
   * The Codex user who authored + submitted this version. Optional
   * to match the QMS-side contract ("when present must have
   * display_name + well-formed email"). The /api/ssp/generate and
   * /api/ssp/[id]/submit-to-doc-control routes always populate it;
   * back-office operator scripts may omit when running end-to-end
   * fixture flows. Not a signoff — see signoffs[] for those.
   */
  author?: BridgeAuthorPayload;
  tally: {
    controls_covered: number;
    controls_met: number;
    controls_not_met: number;
    controls_na: number;
    controls_met_via_evidence: number;
    controls_met_via_esp: number;
    controls_met_via_enduring_exception: number;
    controls_met_via_dod_cio: number;
    controls_met_via_op_plan: number;
  };
  controls_mapped: string[];
  /**
   * Optional Codex-side approval signoffs (ISSO/SO/AO). Empty by
   * default — auto-submit-on-generate sends []. Populated only when
   * an OSA has explicitly signed via /api/ssp/[id]/sign-off before
   * submission. The release signature chain (Reviewer/Approver/
   * Quality Release) is QMS-side and lives outside this array.
   */
  signoffs: BridgeSignoffPayload[];
  artifacts: {
    pdf_base64: string;
    pdf_sha256: string;
    canonical_json: unknown;
    canonical_json_sha256: string;
  };
}

export interface BridgeResponse {
  ok: boolean;
  /** HTTP status code returned by QMS (or 0 if we never got that far). */
  status: number;
  /** QMS-side submission id when ok. */
  qmsSubmissionId?: string;
  qmsDocumentNumber?: string;
  reviewWindowDaysEstimate?: number;
  /** Free-form failure reason when !ok. Truncated to 500 chars. */
  reason?: string;
}

function authConfigured(): { token: string; hmacKey: string } | null {
  const token = process.env.SSP_DOC_CONTROL_BRIDGE_TOKEN;
  const hmacKey = process.env.SSP_DOC_CONTROL_BRIDGE_HMAC;
  if (!token || token.length < 16) return null;
  if (!hmacKey || hmacKey.length < 16) return null;
  return { token, hmacKey };
}

/** Test helper: returns true iff the env is wired up. */
export function isBridgeConfigured(): boolean {
  return authConfigured() !== null;
}

/**
 * Send a single submission to QMS. Returns a structured result; never
 * throws. The caller persists the result onto ssp_doc_control_submissions
 * (qms_submission_id on success, last_outbound_error on failure).
 */
export async function submitToQms(
  payload: Omit<BridgeRequestPayload, "bridge_version">,
): Promise<BridgeResponse> {
  const auth = authConfigured();
  if (!auth) {
    return {
      ok: false,
      status: 0,
      reason:
        "SSP_DOC_CONTROL_BRIDGE_TOKEN or SSP_DOC_CONTROL_BRIDGE_HMAC env var not set on Codex; submission stored but not transmitted.",
    };
  }

  const fullPayload: BridgeRequestPayload = {
    bridge_version: BRIDGE_VERSION,
    ...payload,
  };

  // CRITICAL: HMAC must be over the EXACT bytes we send. We control the
  // serialization here so the signing input and the HTTP body are
  // byte-identical — no whitespace drift, no key reordering between
  // signing and sending.
  const rawBody = JSON.stringify(fullPayload);
  const mac = createHmac("sha256", auth.hmacKey).update(rawBody).digest("hex");

  let res: Response;
  try {
    res = await fetch(`${QMS_BASE_URL}${QMS_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "X-Codex-Signature": `sha256=${mac}`,
        "Content-Type": "application/json",
        "User-Agent": "TrustCodex-SspDocControlBridge/1.0",
      },
      body: rawBody,
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: `Network error reaching QMS: ${
        err instanceof Error ? err.message : String(err)
      }`.slice(0, 500),
    };
  }

  let bodyJson: unknown = null;
  let bodyText = "";
  try {
    bodyText = await res.text();
    if (bodyText) bodyJson = JSON.parse(bodyText);
  } catch {
    /* ignore — we'll fall back to text */
  }

  // 202 = accepted (new submission), 200 = idempotent replay (existing
  // QMS row returned as-is). Both are success.
  if (res.status === 202 || res.status === 200) {
    const j = (bodyJson ?? {}) as {
      qms_submission_id?: string;
      qms_document_number?: string;
      review_window_days_estimate?: number;
    };
    return {
      ok: true,
      status: res.status,
      qmsSubmissionId: j.qms_submission_id,
      qmsDocumentNumber: j.qms_document_number,
      reviewWindowDaysEstimate: j.review_window_days_estimate,
    };
  }

  // Anything else is a failure. Surface QMS's full error detail so the
  // operator sees which validation gate tripped, not just the top-level
  // error code. QMS contract sends:
  //   { error: "invalid_payload", details: [{ field, code, message }, …] }
  // for 400s; we flatten details into the user-facing reason.
  const errBody = (bodyJson ?? bodyText) as
    | {
        error?: string;
        details?: Array<{ field?: string; code?: string; message?: string }>;
        message?: string;
      }
    | string;
  let reasonText: string;
  if (typeof errBody === "string") {
    reasonText = errBody;
  } else {
    const code = errBody.error ?? `HTTP ${res.status}`;
    const detailParts: string[] = [];
    if (Array.isArray(errBody.details)) {
      for (const d of errBody.details) {
        const piece = [d.field, d.code, d.message].filter(Boolean).join(" · ");
        if (piece) detailParts.push(piece);
      }
    }
    if (errBody.message && !detailParts.length) detailParts.push(errBody.message);
    reasonText = detailParts.length
      ? `${code} — ${detailParts.join("; ")}`
      : code;
  }
  return {
    ok: false,
    status: res.status,
    reason: `QMS returned HTTP ${res.status}: ${reasonText}`.slice(0, 500),
  };
}
