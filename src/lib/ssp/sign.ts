/**
 * Codex-side SSP signing — Posture A+ from the plan.
 *
 * Phase C2 ships an attestation-only signature: the signing routine
 * records WHO produced the version (Codex), the payload_sha256 it
 * binds to, the signing service identifier, and the timestamp. No
 * cryptographic signature material is produced because there's no
 * private-key infrastructure yet in Codex.
 *
 * The data_hash IS the cryptographic integrity anchor; the signature
 * row is an audit-trail attestation that "Codex computed this hash
 * over the canonicalized payload and labels it as the
 * authorizing-record version." When real key infrastructure lands
 * (Posture C, customer-held countersignature), this helper grows an
 * Ed25519 (or RS256) branch that produces a real detached signature.
 *
 * The shape returned matches sspDocuments.signature_alg /
 * signature_kid / signature_value columns so swapping in real crypto
 * is a one-line change in the helper.
 */
import { createHmac } from "node:crypto";

export interface SspSignature {
  alg: "attestation_only" | "ed25519" | "rs256" | "hmac_sha256";
  kid: string;
  value: string;
  signedAt: Date;
}

const SIGNING_SERVICE_ID = "codex.mactech.ssp.v1";

/**
 * Produce a signature for the given payload_sha256.
 *
 * If `SSP_SIGNING_HMAC_SECRET` is set in the environment, use HMAC-
 * SHA-256 over the payload hash + signing service id. This is a
 * stronger-than-attestation-only path that doesn't require key
 * management infrastructure: the customer + Codex both hold the
 * shared secret, so the customer can verify the signature locally.
 *
 * Otherwise fall back to attestation-only: signature_value is the
 * concatenation of payload_sha256 + signing_service_id + timestamp,
 * which an auditor can inspect but isn't cryptographically meaningful.
 * The data_hash itself remains the integrity anchor.
 */
export function signSsp(payloadSha256: string): SspSignature {
  const now = new Date();
  const hmacSecret = process.env.SSP_SIGNING_HMAC_SECRET;

  if (hmacSecret && hmacSecret.length >= 32) {
    const message = `${payloadSha256}.${SIGNING_SERVICE_ID}.${now.toISOString()}`;
    const mac = createHmac("sha256", hmacSecret).update(message).digest("hex");
    return {
      alg: "hmac_sha256",
      kid: SIGNING_SERVICE_ID,
      value: `${now.toISOString()}.${mac}`,
      signedAt: now,
    };
  }

  return {
    alg: "attestation_only",
    kid: SIGNING_SERVICE_ID,
    value: `${SIGNING_SERVICE_ID}@${now.toISOString()}#sha256:${payloadSha256.slice(0, 16)}`,
    signedAt: now,
  };
}

/**
 * Verify a signature against an expected payload_sha256. Returns true
 * if the signature was produced by this Codex instance for that hash.
 *
 * For attestation-only signatures, "verify" just confirms the embedded
 * payload_sha256 prefix matches — the signature isn't cryptographically
 * binding, so this is best-effort.
 *
 * For hmac_sha256 signatures, recomputes the MAC and compares.
 */
export function verifySspSignature(
  signature: { alg: string; value: string },
  payloadSha256: string,
): { ok: boolean; reason?: string } {
  if (signature.alg === "attestation_only") {
    if (signature.value.includes(payloadSha256.slice(0, 16))) {
      return { ok: true };
    }
    return { ok: false, reason: "attestation value doesn't reference this hash" };
  }
  if (signature.alg === "hmac_sha256") {
    const hmacSecret = process.env.SSP_SIGNING_HMAC_SECRET;
    if (!hmacSecret) {
      return { ok: false, reason: "SSP_SIGNING_HMAC_SECRET not configured" };
    }
    const [tsIso, mac] = signature.value.split(".");
    if (!tsIso || !mac) {
      return { ok: false, reason: "malformed hmac signature value" };
    }
    const message = `${payloadSha256}.${SIGNING_SERVICE_ID}.${tsIso}`;
    const expected = createHmac("sha256", hmacSecret)
      .update(message)
      .digest("hex");
    if (expected === mac) return { ok: true };
    return { ok: false, reason: "hmac mismatch" };
  }
  return { ok: false, reason: `unsupported signature alg: ${signature.alg}` };
}
