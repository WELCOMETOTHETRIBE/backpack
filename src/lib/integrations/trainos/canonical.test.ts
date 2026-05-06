/**
 * Vendored canonicalizer conformance — drives TrainOS's `runFixtures()`
 * helper through our test runner so we get one green/red signal that this
 * repo's vendored bytes match what TrainOS produces. If this fails after a
 * re-vendor, evidence hash verification on the inbound webhook will start
 * failing too — do not skip or quarantine.
 *
 * The fixtures themselves (18 happy-path snapshots + 8 negative cases)
 * live in canonical.fixtures.ts, also vendored verbatim. See version.ts
 * for the pinned commit + re-vendor flow.
 */

import { describe, it, expect } from "vitest";
import { CANONICALIZATION_VERSION, canonicalize, canonicalBytes } from "./canonical";
import { fixtures, errorFixtures, runFixtures } from "./canonical.fixtures";
import { TRAINOS_CANONICALIZER_COMMIT } from "./version";

describe("canonicalizer — vendored from cmmc-training-hub", () => {
  it("pinned to a 40-char SHA", () => {
    expect(TRAINOS_CANONICALIZER_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });

  it("CANONICALIZATION_VERSION is v1", () => {
    expect(CANONICALIZATION_VERSION).toBe("v1");
  });

  it("loaded the expected fixture counts (18 happy + 8 negative)", () => {
    expect(fixtures.length).toBe(18);
    expect(errorFixtures.length).toBe(8);
  });

  it("runFixtures() — every snapshot + every negative case passes", () => {
    expect(() => runFixtures()).not.toThrow();
  });

  it("canonicalBytes() round-trips through TextEncoder for the simplest input", () => {
    const bytes = canonicalBytes({});
    expect(new TextDecoder().decode(bytes)).toBe("{}");
    expect(canonicalize({})).toBe("{}");
  });

  // Sanity check at the integration seam: the consumer side (Codex) and the
  // producer side (TrainOS) MUST agree on the bytes for a realistic
  // attempt.completed canonical evidence subobject. If TrainOS later sends
  // us a payload claiming sha256 X, we recompute via canonicalize() and
  // expect to land on the same X. The fixtures cover the building blocks;
  // this case strings them together for a TrainOS-shaped payload.
  it("two semantically-equal evidence payloads produce identical bytes", () => {
    const evidenceA = {
      score: 92,
      passed: true,
      controlMappings: [
        { controlId: "AT.L2-3.2.1", objective: "[a]" },
        { controlId: "AT.L2-3.2.1", objective: "[b]" },
      ],
      learnerEmail: "patrick@welcometothetribe.com",
    };
    const evidenceB = {
      learnerEmail: "patrick@welcometothetribe.com",
      controlMappings: [
        { objective: "[a]", controlId: "AT.L2-3.2.1" },
        { objective: "[b]", controlId: "AT.L2-3.2.1" },
      ],
      passed: true,
      score: 92,
    };
    expect(canonicalize(evidenceA)).toBe(canonicalize(evidenceB));
  });
});
