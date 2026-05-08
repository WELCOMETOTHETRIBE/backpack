import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyTrainosSignature } from "./hmac";

const SECRET = "9f3a8d2c1b7e6a5f4d3c2b1a0e9d8c7b6a5f4e3d2c1b0a9e8d7c6b5a4f3e2d1c";
const NOW = 1_750_000_000_000;

function sign(secret: string, ts: number, body: string) {
  return "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

describe("verifyTrainosSignature — happy path", () => {
  it("accepts a freshly signed payload", () => {
    const body = '{"event":"evidence.attempt.completed"}';
    const ts = NOW;
    const sig = sign(SECRET, ts, body);
    const result = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(ts),
      secret: SECRET,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts uppercase hex signature (case-insensitive on hex)", () => {
    const body = '{"x":1}';
    const sig = sign(SECRET, NOW, body).toUpperCase().replace("SHA256=", "sha256=");
    const result = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(NOW),
      secret: SECRET,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });
});

describe("verifyTrainosSignature — header validation (400 don't-retry)", () => {
  const base = {
    rawBody: '{"x":1}',
    signatureHeader: sign(SECRET, NOW, '{"x":1}'),
    timestampHeader: String(NOW),
    secret: SECRET,
    now: NOW,
  };

  it("missing signature header → 400", () => {
    const r = verifyTrainosSignature({ ...base, signatureHeader: null });
    expect(r).toMatchObject({ ok: false, reason: "missing_signature_header", status: 400 });
  });

  it("missing timestamp header → 400", () => {
    const r = verifyTrainosSignature({ ...base, timestampHeader: null });
    expect(r).toMatchObject({ ok: false, reason: "missing_timestamp_header", status: 400 });
  });

  it("malformed timestamp → 400", () => {
    const r = verifyTrainosSignature({ ...base, timestampHeader: "not-a-number" });
    expect(r).toMatchObject({ ok: false, reason: "malformed_timestamp", status: 400 });
  });

  it("negative timestamp → 400", () => {
    const r = verifyTrainosSignature({ ...base, timestampHeader: "-1" });
    expect(r).toMatchObject({ ok: false, reason: "malformed_timestamp", status: 400 });
  });

  it("signature missing the sha256= prefix → 400", () => {
    const r = verifyTrainosSignature({ ...base, signatureHeader: "abc123" });
    expect(r).toMatchObject({ ok: false, reason: "malformed_signature", status: 400 });
  });

  it("signature with wrong-length hex → 400", () => {
    const r = verifyTrainosSignature({ ...base, signatureHeader: "sha256=deadbeef" });
    expect(r).toMatchObject({ ok: false, reason: "malformed_signature", status: 400 });
  });
});

describe("verifyTrainosSignature — replay window (401 don't-retry)", () => {
  const body = '{"x":1}';

  it("rejects timestamp too far in the past", () => {
    const oldTs = NOW - 6 * 60 * 1000;
    const sig = sign(SECRET, oldTs, body);
    const r = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(oldTs),
      secret: SECRET,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, reason: "timestamp_out_of_window", status: 401 });
  });

  it("rejects timestamp too far in the future", () => {
    const futureTs = NOW + 6 * 60 * 1000;
    const sig = sign(SECRET, futureTs, body);
    const r = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(futureTs),
      secret: SECRET,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, reason: "timestamp_out_of_window", status: 401 });
  });

  it("accepts boundary at exactly 5 minutes", () => {
    const ts = NOW - 5 * 60 * 1000;
    const r = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, ts, body),
      timestampHeader: String(ts),
      secret: SECRET,
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });
});

describe("verifyTrainosSignature — signature mismatch (401)", () => {
  const body = '{"x":1}';

  it("rejects when secret differs", () => {
    const sig = sign("different-secret", NOW, body);
    const r = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(NOW),
      secret: SECRET,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, reason: "signature_mismatch", status: 401 });
  });

  it("rejects when body bytes were tampered after signing", () => {
    const sig = sign(SECRET, NOW, body);
    const r = verifyTrainosSignature({
      rawBody: '{"x":2}', // body changed
      signatureHeader: sig,
      timestampHeader: String(NOW),
      secret: SECRET,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, reason: "signature_mismatch", status: 401 });
  });

  it("rejects when timestamp doesn't match the signed timestamp", () => {
    const sig = sign(SECRET, NOW, body);
    const r = verifyTrainosSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(NOW + 1), // attacker shifts timestamp
      secret: SECRET,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, reason: "signature_mismatch", status: 401 });
  });
});
