/**
 * HMAC-SHA256 webhook signature verification for TrainOS deliveries.
 *
 * The signature scheme matches Stripe / Slack and is documented in the
 * TrainOS integration brief §2:
 *
 *   X-TrainOS-Signature: sha256=<hex(hmac_sha256(secret, "{ts}.{body}"))>
 *
 * where:
 *   - secret = organizations.trainos_webhook_secret (per-tenant, hex-encoded)
 *   - ts     = X-TrainOS-Timestamp header (unix-ms, decimal string)
 *   - body   = raw request body bytes (UTF-8)
 *
 * We also enforce a 5-minute timestamp window to mitigate replay (same
 * threshold as our EnclaveWatch ingest).
 *
 * Failures from this module map to specific HTTP status codes per the
 * brief's §5 retry semantics:
 *   - missing/malformed headers     → 400 (don't retry)
 *   - signature mismatch            → 401 (don't retry)
 *   - timestamp out of window       → 401 (don't retry)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** ±5 minutes — matches our existing webhook ingest contracts. */
export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export type HmacVerificationFailure =
  | { ok: false; reason: "missing_signature_header"; status: 400 }
  | { ok: false; reason: "missing_timestamp_header"; status: 400 }
  | { ok: false; reason: "malformed_timestamp"; status: 400 }
  | { ok: false; reason: "malformed_signature"; status: 400 }
  | { ok: false; reason: "timestamp_out_of_window"; status: 401; skewMs: number }
  | { ok: false; reason: "signature_mismatch"; status: 401 };

export type HmacVerificationResult = { ok: true } | HmacVerificationFailure;

export interface HmacVerifyArgs {
  /** Raw UTF-8 request body. Must be the exact bytes the sender hashed. */
  rawBody: string;
  /** X-TrainOS-Signature header value (e.g. "sha256=abcdef..."). */
  signatureHeader: string | null;
  /** X-TrainOS-Timestamp header value (unix-ms, decimal). */
  timestampHeader: string | null;
  /** Per-tenant secret from organizations.trainos_webhook_secret. */
  secret: string;
  /** Override Date.now() for tests; defaults to wall clock. */
  now?: number;
  /** Override the tolerance window for tests; defaults to 5 minutes. */
  toleranceMs?: number;
}

export function verifyTrainosSignature(args: HmacVerifyArgs): HmacVerificationResult {
  const now = args.now ?? Date.now();
  const tolerance = args.toleranceMs ?? TIMESTAMP_TOLERANCE_MS;

  if (!args.signatureHeader) {
    return { ok: false, reason: "missing_signature_header", status: 400 };
  }
  if (!args.timestampHeader) {
    return { ok: false, reason: "missing_timestamp_header", status: 400 };
  }

  const ts = Number(args.timestampHeader);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, reason: "malformed_timestamp", status: 400 };
  }

  const skew = Math.abs(now - ts);
  if (skew > tolerance) {
    return { ok: false, reason: "timestamp_out_of_window", status: 401, skewMs: skew };
  }

  // Header must be "sha256=<hex>".
  if (!args.signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "malformed_signature", status: 400 };
  }
  const providedHex = args.signatureHeader.slice("sha256=".length).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(providedHex)) {
    return { ok: false, reason: "malformed_signature", status: 400 };
  }

  const stringToSign = `${args.timestampHeader}.${args.rawBody}`;
  const expectedHex = createHmac("sha256", args.secret).update(stringToSign).digest("hex");

  // Constant-time compare. timingSafeEqual requires equal-length buffers;
  // we already validated providedHex is 64 hex chars and expectedHex is too.
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(providedHex.toLowerCase(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch", status: 401 };
  }

  return { ok: true };
}
