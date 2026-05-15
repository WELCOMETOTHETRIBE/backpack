import { describe, expect, it } from "vitest";

import {
  buildManifestWithHash,
  canonicalizeManifest,
} from "@/lib/intake/manifest";
import { canTransitionIntakeStatus } from "@/lib/intake/status";

describe("intake manifest canonicalization", () => {
  it("creates stable canonical json and hash regardless of key order", () => {
    const a = {
      z: "last",
      nested: { b: 2, a: 1 },
      arr: [{ y: 2, x: 1 }],
    };
    const b = {
      arr: [{ x: 1, y: 2 }],
      nested: { a: 1, b: 2 },
      z: "last",
    };

    const aCanonical = canonicalizeManifest(a);
    const bCanonical = canonicalizeManifest(b);
    const aHash = buildManifestWithHash(a).manifestHash;
    const bHash = buildManifestWithHash(b).manifestHash;

    expect(aCanonical).toBe(bCanonical);
    expect(aHash).toBe(bHash);
    expect(aHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("redacts secret-like keys and SAS/token values", () => {
    const payload = {
      access_scope: "https://blob.core.usgovcloudapi.net/c/intake?a=1&sig=abc123",
      sender: {
        api_token: "super-secret",
      },
      notes: "token=abc secret=def",
    };
    const canonical = canonicalizeManifest(payload);
    expect(canonical).not.toContain("abc123");
    expect(canonical).not.toContain("super-secret");
    expect(canonical).toContain("REDACTED");
  });

  it("supports deterministic regeneration/tamper detection", () => {
    const base = {
      intake_transaction_id: "INTAKE-ACME-PROJ-20260514-0001",
      file: { name: "a.txt", hash: "abcd" },
      generated_at: "2026-05-14T00:00:00.000Z",
    };
    const a = buildManifestWithHash(base).manifestHash;
    const b = buildManifestWithHash(base).manifestHash;
    const tampered = buildManifestWithHash({
      ...base,
      file: { ...base.file, hash: "dcba" },
    }).manifestHash;
    expect(a).toBe(b);
    expect(tampered).not.toBe(a);
  });

  it("stays stable with tokenized filename/path references", () => {
    const payloadA = {
      files: [
        {
          intake_object_alias: "INTAKEOBJ-202605140001-a1b2c3",
          original_filename_hash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          blob_path_reference: "redacted://blob/1234abcd",
          blob_path_hash:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const payloadB = {
      files: [
        {
          blob_path_hash:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          intake_object_alias: "INTAKEOBJ-202605140001-a1b2c3",
          blob_path_reference: "redacted://blob/1234abcd",
          original_filename_hash:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    };
    const a = buildManifestWithHash(payloadA).manifestHash;
    const b = buildManifestWithHash(payloadB).manifestHash;
    expect(a).toBe(b);
  });
});

describe("intake status transitions", () => {
  it("allows happy-path transitions", () => {
    expect(canTransitionIntakeStatus("Draft", "Pending Authorization")).toBe(true);
    expect(
      canTransitionIntakeStatus("Evidence Package Generated", "Closed"),
    ).toBe(true);
  });

  it("rejects unsafe jumps", () => {
    expect(canTransitionIntakeStatus("Draft", "Imported to Vault")).toBe(false);
    expect(canTransitionIntakeStatus("Closed", "Draft")).toBe(false);
  });
});
