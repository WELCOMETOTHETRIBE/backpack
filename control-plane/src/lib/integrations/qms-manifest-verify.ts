/**
 * Server-only manifest verification: canonical-JSON serialization,
 * content-hash recompute, signing-hash recompute, and timing-safe HMAC
 * comparison against the shared QMS_MANIFEST_SIGNING_SECRET.
 *
 * Pairs with the QMS-side builder which performs the SAME serialization
 * and signing. Any drift here fails verification and the manifest is
 * rejected.
 *
 * Canonicalization rules (deterministic JSON):
 *   - object keys sorted lexicographically at every depth
 *   - arrays preserve order
 *   - primitive values JSON-encoded (ECMA-262 stringify)
 *   - no whitespace between tokens
 *   - undefined values dropped (treated as missing keys)
 *
 * Signing chain (locked in docs/specs/qms-governance-manifest-ingest-brief.md):
 *   content_hash = "sha256:" + hex( sha256( canonical({ run_id, generated_at,
 *                                              source, documents,
 *                                              controls_touched, doc_count }) ))
 *   signing_hash = "sha256:" + hex( sha256(
 *                    `${content_hash}|${run_id}|${generated_at}|${issuer.client_id}` ))
 *   signature    = base64url( HMAC-SHA-256( secret, signing_hash ) )
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ManifestEnvelope } from "./qms-manifest-schema";

// Recursively sort keys to produce a canonical JSON string.
function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(",")}}`;
  }
  // Functions, symbols, bigints — should not appear in a JSON envelope.
  return "null";
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeContentHash(
  envelope: Pick<
    ManifestEnvelope,
    "run_id" | "generated_at" | "source" | "documents" | "controls_touched" | "doc_count"
  >,
): string {
  const body = {
    run_id: envelope.run_id,
    generated_at: envelope.generated_at,
    source: envelope.source,
    documents: envelope.documents.map((d) => ({
      // Project to the audit-relevant fields. Dates remain as ISO/date
      // strings (or null) — the schema preserves them as strings exactly
      // so this hash matches what the QMS-side builder produces from the
      // same input.
      controls_mapped: [...d.controls_mapped].sort(),
      document_name: d.document_name,
      document_number: d.document_number,
      document_type: d.document_type ?? null,
      effective_date: d.effective_date ?? null,
      file_path: d.file_path ?? null,
      file_size_bytes: d.file_size_bytes ?? null,
      next_review_date: d.next_review_date ?? null,
      // v1.2 fields. Default false/null/[] when absent so v1.1 envelopes
      // produce the same hash on both sides.
      released: d.released ?? false,
      released_at: d.released_at ?? null,
      signatures: Array.isArray(d.signatures)
        ? [...d.signatures]
            .sort((a, b) =>
              String(b.signed_at ?? "").localeCompare(String(a.signed_at ?? "")),
            )
            .map((s) => ({
              document_hash: s.document_hash ?? null,
              signature_hash: s.signature_hash ?? null,
              signature_meaning: s.signature_meaning ?? null,
              signed_at: s.signed_at ?? null,
              signer_email: s.signer_email ?? null,
              signer_name: s.signer_name ?? null,
            }))
        : [],
      sha256: d.sha256.toLowerCase(),
      status: d.status ?? null,
      version: d.version ?? null,
    })),
    controls_touched: [...envelope.controls_touched].sort(),
    doc_count: envelope.doc_count,
  };
  return `sha256:${sha256Hex(canonicalize(body))}`;
}

export function computeSigningHash(input: {
  content_hash: string;
  run_id: string;
  generated_at: string;
  issuer_client_id: string;
}): string {
  const composed = `${input.content_hash}|${input.run_id}|${input.generated_at}|${input.issuer_client_id}`;
  return `sha256:${sha256Hex(composed)}`;
}

// Resolve the HMAC key for the given kid. Single-key today; the
// indirection lets us add `kid → secret` map for rotation later.
function resolveSecretForKid(kid: string): Buffer | null {
  const primary = process.env.QMS_MANIFEST_SIGNING_SECRET;
  if (!primary) return null;
  // Future: parse process.env.QMS_MANIFEST_SIGNING_SECRETS as a JSON map
  // { "<kid>": "<base64-secret>", ... } when we need rotation. For now
  // accept any kid as long as the single secret matches.
  void kid;
  return Buffer.from(primary, "utf8");
}

function base64UrlDecodeToBuffer(value: string): Buffer | null {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  try {
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}

export function verifySignature(
  envelope: ManifestEnvelope,
  expectedSigningHash: string,
): { ok: true } | { ok: false; reason: string } {
  if (envelope.signing_hash !== expectedSigningHash) {
    return {
      ok: false,
      reason: "signing_hash in envelope does not match recomputed signing_hash",
    };
  }

  const secret = resolveSecretForKid(envelope.signature.kid);
  if (!secret) {
    return {
      ok: false,
      reason:
        "signing secret not configured (QMS_MANIFEST_SIGNING_SECRET unset, or unknown kid)",
    };
  }

  const expectedSig = createHmac("sha256", secret)
    .update(envelope.signing_hash, "utf8")
    .digest();
  const providedSig = base64UrlDecodeToBuffer(envelope.signature.value);
  if (!providedSig) return { ok: false, reason: "signature.value not base64url" };
  if (providedSig.length !== expectedSig.length) {
    return { ok: false, reason: "signature length mismatch" };
  }
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return { ok: false, reason: "HMAC signature does not verify" };
  }
  return { ok: true };
}

/**
 * Full verification chain: recompute content_hash, recompute signing_hash,
 * verify HMAC. Returns either { ok: true } or a structured error reason.
 * Never throws; all failure modes return a typed result.
 */
export function verifyEnvelope(
  envelope: ManifestEnvelope,
): { ok: true } | { ok: false; reason: string } {
  const recomputedContent = computeContentHash(envelope);
  if (envelope.content_hash !== recomputedContent) {
    return {
      ok: false,
      reason: "content_hash in envelope does not match recomputed canonical body",
    };
  }
  const recomputedSigning = computeSigningHash({
    content_hash: envelope.content_hash,
    run_id: envelope.run_id,
    generated_at: envelope.generated_at,
    issuer_client_id: envelope.issuer.client_id,
  });
  return verifySignature(envelope, recomputedSigning);
}

// Exported for tests so the corresponding QMS-side builder can be
// validated against the same canonicalization logic.
export const __test = {
  canonicalize,
  sha256Hex,
  base64UrlDecodeToBuffer,
};
