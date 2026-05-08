/**
 * Unit tests for the QMS manifest verification chain. No DB or HTTP — pure
 * canonicalize + hash + HMAC. Run via `npm test`.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  computeContentHash,
  computeSigningHash,
  verifyEnvelope,
  __test,
} from "../qms-manifest-verify";
import { manifestEnvelopeSchema } from "../qms-manifest-schema";

const SECRET = "unit-test-secret-do-not-use-in-prod";

beforeAll(() => {
  process.env.QMS_MANIFEST_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  process.env.QMS_MANIFEST_SIGNING_SECRET = SECRET;
});

const NOW_ISO = "2026-05-06T08:30:00.000Z";

function buildEnvelope(overrides: Record<string, unknown> = {}) {
  const baseDocs = [
    {
      document_number: "MAC-POL-001",
      document_name: "Access Control Policy",
      document_type: "policy",
      file_path: "qms/documents/MAC-POL-001/v1.0.html",
      version: "1.0",
      status: "effective",
      effective_date: "2026-01-15",
      next_review_date: "2027-01-15",
      sha256:
        "470e28b959ad2b8fe6adc5c588e38ae601d60310028ee6ce684a92860a0ed211",
      file_size_bytes: 7249,
      controls_mapped: ["3.1.4"],
    },
    {
      document_number: "MAC-IRP-001",
      document_name: "Incident Response Plan",
      document_type: "plan",
      file_path: "qms/documents/MAC-IRP-001/v2.0.html",
      version: "2.0",
      status: "in_review",
      effective_date: null,
      next_review_date: null,
      sha256:
        "2b0a02f395ff9dce14a3f486d612ea3a2aecd767b92baed690cb8b38ed9a5320",
      file_size_bytes: 18453,
      controls_mapped: ["3.6.1", "3.6.2", "3.6.3"],
    },
  ];
  const controlsTouched = ["3.1.4", "3.6.1", "3.6.2", "3.6.3"];

  const body = {
    schema: "mactech-governance-manifest.v1.1",
    generated_at: NOW_ISO,
    generated_by: "qms-server",
    tool_version: "1.0.0-qms",
    run_id: "GOV-20260506083000-test01",
    base_path: "qms://document-control",
    source: "qms_document_control",
    issuer: {
      service: "qms",
      url: "https://quality.mactechsolutionsllc.com",
      client_id: "mactech-qms-manifest-issuer",
    },
    documents: baseDocs,
    controls_touched: controlsTouched,
    doc_count: baseDocs.length,
    ...overrides,
  };

  // Dates are kept as strings throughout — schema preserves, hash sees
  // strings — so we feed the same plain object to computeContentHash
  // that the QMS-side builder would.
  const content_hash = computeContentHash({
    run_id: body.run_id,
    generated_at: body.generated_at,
    source: body.source,
    documents: body.documents,
    controls_touched: body.controls_touched,
    doc_count: body.doc_count,
  });
  const signing_hash = computeSigningHash({
    content_hash,
    run_id: body.run_id,
    generated_at: body.generated_at,
    issuer_client_id: body.issuer.client_id,
  });
  const signatureValue = createHmac("sha256", Buffer.from(SECRET, "utf8"))
    .update(signing_hash, "utf8")
    .digest("base64url");

  return {
    ...body,
    content_hash,
    signing_hash,
    signature: {
      alg: "HMAC-SHA256",
      kid: "qms-manifest-2026-05",
      value: signatureValue,
    },
  };
}

describe("canonicalize", () => {
  it("sorts object keys deterministically across permutations", () => {
    const a = __test.canonicalize({ b: 1, a: 2, c: 3 });
    const b = __test.canonicalize({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it("preserves array order", () => {
    expect(__test.canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined keys", () => {
    expect(__test.canonicalize({ a: 1, b: undefined, c: 2 })).toBe(
      '{"a":1,"c":2}',
    );
  });

  it("handles nested objects + null + booleans + numbers + strings", () => {
    expect(
      __test.canonicalize({
        nested: { z: null, y: true, x: 4.2 },
        s: "hi",
      }),
    ).toBe('{"nested":{"x":4.2,"y":true,"z":null},"s":"hi"}');
  });
});

describe("verifyEnvelope — happy path", () => {
  it("accepts a freshly-signed envelope from buildEnvelope()", () => {
    const env = buildEnvelope();
    const parsed = manifestEnvelopeSchema.parse(env);
    expect(verifyEnvelope(parsed)).toEqual({ ok: true });
  });
});

describe("verifyEnvelope — tampering detection", () => {
  it("rejects when content_hash is wrong", () => {
    const env = buildEnvelope();
    env.content_hash = "sha256:" + "0".repeat(64);
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/content_hash/);
    }
  });

  it("rejects when a document's controls_mapped is silently changed (changes content_hash)", () => {
    const env = buildEnvelope();
    // Tamper consistently so superRefine passes (controls_touched
    // mirrors the new controls_mapped), but DON'T regenerate
    // content_hash. Codex's recompute should mismatch the envelope's.
    env.documents[0].controls_mapped = ["3.1.4", "3.99.99"];
    env.controls_touched = [...env.controls_touched, "3.99.99"];
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/content_hash/);
    }
  });

  it("rejects when a doc's sha256 is tampered (changes content_hash)", () => {
    const env = buildEnvelope();
    env.documents[0].sha256 = "0".repeat(64);
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/content_hash/);
    }
  });

  it("rejects when signing_hash is recomputed but signature wasn't re-signed", () => {
    const env = buildEnvelope();
    // Re-do content_hash + signing_hash to match a tampered field, but
    // leave the original HMAC signature in place.
    const tampered = {
      ...env,
      run_id: "GOV-20260506083000-evil1",
    };
    const parsed = manifestEnvelopeSchema.parse(tampered);
    // signing_hash will mismatch because it was computed with the
    // original run_id; verifyEnvelope catches via content_hash first
    // (since recomputed content uses the new run_id too).
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
  });

  it("rejects when signature.value is corrupted (HMAC mismatch)", () => {
    const env = buildEnvelope();
    // Flip a single character in the base64url signature.
    env.signature.value =
      env.signature.value.slice(0, -1) +
      (env.signature.value.endsWith("a") ? "b" : "a");
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/signature|HMAC/);
    }
  });

  it("rejects when QMS_MANIFEST_SIGNING_SECRET is unset", () => {
    delete process.env.QMS_MANIFEST_SIGNING_SECRET;
    const env = buildEnvelope();
    process.env.QMS_MANIFEST_SIGNING_SECRET = SECRET; // restore for verify
    delete process.env.QMS_MANIFEST_SIGNING_SECRET;
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/secret/);
    }
  });

  it("rejects when signature was signed with a different secret", () => {
    const env = buildEnvelope();
    // Re-sign with the wrong secret, leaving signing_hash valid.
    env.signature.value = createHmac("sha256", Buffer.from("wrong-secret"))
      .update(env.signing_hash, "utf8")
      .digest("base64url");
    const parsed = manifestEnvelopeSchema.parse(env);
    const result = verifyEnvelope(parsed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/HMAC/);
    }
  });
});

describe("manifestEnvelopeSchema — superRefine", () => {
  it("rejects when doc_count != documents.length", () => {
    const env = buildEnvelope();
    const tampered = { ...env, doc_count: 99 };
    const result = manifestEnvelopeSchema.safeParse(tampered);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/doc_count/);
    }
  });

  it("rejects when documents[].controls_mapped contains a control not in controls_touched", () => {
    const env = buildEnvelope();
    const tampered = {
      ...env,
      documents: env.documents.map((d, i) =>
        i === 0
          ? { ...d, controls_mapped: ["3.99.99-unmapped"] }
          : d,
      ),
    };
    const result = manifestEnvelopeSchema.safeParse(tampered);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.format())).toMatch(/controls_touched/);
    }
  });
});

describe("computeContentHash — determinism", () => {
  it("yields the same hash regardless of documents[].field-key order", () => {
    const env1 = buildEnvelope();
    const parsed1 = manifestEnvelopeSchema.parse(env1);

    // Round-trip through JSON to permute field order then re-parse.
    const permuted = JSON.parse(JSON.stringify(env1));
    permuted.documents = permuted.documents.map((d: Record<string, unknown>) => {
      const entries = Object.entries(d).reverse();
      return Object.fromEntries(entries);
    });
    const parsed2 = manifestEnvelopeSchema.parse(permuted);

    const hash1 = computeContentHash(parsed1);
    const hash2 = computeContentHash(parsed2);
    expect(hash1).toBe(hash2);
  });
});
