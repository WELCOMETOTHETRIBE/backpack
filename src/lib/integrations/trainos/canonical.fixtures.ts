// Snapshot fixtures for the canonicalizer.
//
// Codex (and any future vendoring consumer) MUST run their port of
// canonicalize() against these inputs and assert the produced bytes
// match `expectedCanonical` exactly + the sha256 matches
// `expectedSha256Hex`. Any divergence = the canonicalizer has drifted
// and evidence hashes will fail to verify on the wire.
//
// The fixtures are exhaustive enough to catch every common drift:
//   • Object key ordering
//   • Number formatting (-0 collapse, integer/float, no exponent)
//   • String escaping (control chars, surrogates, special chars)
//   • undefined-property drop in objects
//   • Negative cases: NaN / Infinity / BigInt / Date / undefined-in-array
//
// Update process: when the canonicalizer changes (CANONICALIZATION_VERSION
// bump), regenerate fixtures via:
//
//   pnpm tsx -e "import {fixtures, regenerate} from './lib/evidence/canonical.fixtures'; regenerate()"
//
// — which prints the updated `expectedCanonical` + `expectedSha256Hex` for
// each case to stdout for diff review.

import { createHash } from "node:crypto";
import { CanonicalError, canonicalize } from "./canonical";

export interface CanonicalFixture {
  /** Stable identifier; appears in failure messages. */
  readonly name: string;
  /** Input passed to `canonicalize()`. Use null for negative-case inputs. */
  readonly input: unknown;
  /** Exact bytes the canonicalizer must produce. */
  readonly expectedCanonical: string;
  /** sha256_hex of utf8 bytes of expectedCanonical. */
  readonly expectedSha256Hex: string;
}

export interface CanonicalErrorFixture {
  readonly name: string;
  /** Factory because some negative-case inputs can't survive a JSON roundtrip. */
  readonly buildInput: () => unknown;
  /** Substring expected in the thrown CanonicalError message. */
  readonly expectedMessageContains: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy-path fixtures
// ─────────────────────────────────────────────────────────────────────────────

export const fixtures: ReadonlyArray<CanonicalFixture> = [
  {
    name: "null",
    input: null,
    expectedCanonical: "null",
    expectedSha256Hex:
      "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
  },
  {
    name: "boolean true",
    input: true,
    expectedCanonical: "true",
    expectedSha256Hex:
      "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
  },
  {
    name: "boolean false",
    input: false,
    expectedCanonical: "false",
    expectedSha256Hex:
      "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
  },
  {
    name: "integer zero",
    input: 0,
    expectedCanonical: "0",
    expectedSha256Hex:
      "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
  },
  {
    name: "negative zero collapses to zero",
    input: -0,
    expectedCanonical: "0",
    expectedSha256Hex:
      "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9",
  },
  {
    name: "positive integer",
    input: 42,
    expectedCanonical: "42",
    expectedSha256Hex:
      "73475cb40a568e8da8a045ced110137e159f890ac4da883b6b17dc651b3a8049",
  },
  {
    name: "negative integer",
    input: -42,
    expectedCanonical: "-42",
    expectedSha256Hex:
      "fec80006df0542549b4cbaafb8987eee00bb49bca396eefe9ac8be5b5928e8f6",
  },
  {
    name: "decimal float",
    input: 3.14,
    expectedCanonical: "3.14",
    expectedSha256Hex:
      "2efff1261c25d94dd6698ea1047f5c0a7107ca98b0a6c2427ee6614143500215",
  },
  {
    name: "empty string",
    input: "",
    expectedCanonical: '""',
    expectedSha256Hex:
      "12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126",
  },
  {
    name: "ascii string",
    input: "hello",
    expectedCanonical: '"hello"',
    expectedSha256Hex:
      "5aa762ae383fbb727af3c7a36d4940a5b8c40a989452d2304fc958ff3f354e7a",
  },
  {
    name: "string with control char (newline)",
    input: "a\nb",
    expectedCanonical: '"a\\nb"',
    expectedSha256Hex:
      "8cb67f89f9ff0e25bb064da96907151d8e0eb7a5c0d4cde1b72ad1c9a30c065e",
  },
  {
    name: "string with quote + backslash",
    input: 'say "hi"\\there',
    expectedCanonical: '"say \\"hi\\"\\\\there"',
    expectedSha256Hex:
      "e6111c28bbc7f2781e3d2d6b51e48399bdc64a0edbed3aebeca6c81882e304aa",
  },
  {
    name: "empty object",
    input: {},
    expectedCanonical: "{}",
    expectedSha256Hex:
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  },
  {
    name: "empty array",
    input: [],
    expectedCanonical: "[]",
    expectedSha256Hex:
      "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  },
  {
    name: "key order independence",
    input: { z: 1, a: 2, m: 3 },
    expectedCanonical: '{"a":2,"m":3,"z":1}',
    expectedSha256Hex:
      "ebba85cfdc0a724b6cc327ecc545faeb38b9fe02eca603b430eb872f5cf75370",
  },
  {
    name: "nested mixed types",
    input: { z: 1, a: { y: 2, x: [3, 4, true, null] }, m: null },
    expectedCanonical: '{"a":{"x":[3,4,true,null],"y":2},"m":null,"z":1}',
    expectedSha256Hex:
      "c46f5981ff2b771cd0fc9bd8ed53c61372c8fae272a8e636fe4758b62177b610",
  },
  {
    name: "object property with undefined value is dropped",
    input: { a: 1, b: undefined as unknown, c: 3 },
    expectedCanonical: '{"a":1,"c":3}',
    expectedSha256Hex:
      "ea89132f027adb270741ddeea16f07ee9921176fcef0ca74c33493f321b98620",
  },
  {
    name: "array preserves order",
    input: [3, 1, 2, "z", "a"],
    expectedCanonical: '[3,1,2,"z","a"]',
    expectedSha256Hex:
      "844256e3ed3fe22f323e628a0a5318d51f1dd0d2b36429536a5032a8456ccc13",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Negative-case fixtures (must throw)
// ─────────────────────────────────────────────────────────────────────────────

export const errorFixtures: ReadonlyArray<CanonicalErrorFixture> = [
  {
    name: "NaN",
    buildInput: () => ({ x: NaN }),
    expectedMessageContains: "non-finite number",
  },
  {
    name: "Infinity",
    buildInput: () => ({ x: Infinity }),
    expectedMessageContains: "non-finite number",
  },
  {
    name: "BigInt",
    buildInput: () => ({ n: BigInt(1) }),
    expectedMessageContains: "BigInt",
  },
  {
    name: "Date",
    buildInput: () => ({ d: new Date() }),
    expectedMessageContains: "non-plain object",
  },
  {
    name: "Map",
    buildInput: () => ({ m: new Map() }),
    expectedMessageContains: "non-plain object",
  },
  {
    name: "undefined inside array",
    buildInput: () => [undefined],
    expectedMessageContains: "undefined",
  },
  {
    name: "function value",
    buildInput: () => ({ fn: () => 1 }),
    expectedMessageContains: "function",
  },
  {
    name: "symbol value",
    buildInput: () => ({ s: Symbol("x") }),
    expectedMessageContains: "symbol",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Self-test + regenerate helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all fixtures against the local canonicalizer. Returns nothing on
 * success; throws on first failure. Vendoring consumers should mirror
 * this loop in their test runner.
 */
export function runFixtures(): void {
  for (const f of fixtures) {
    const got = canonicalize(f.input);
    if (got !== f.expectedCanonical) {
      throw new Error(
        `[${f.name}] canonical mismatch\n  expected: ${JSON.stringify(f.expectedCanonical)}\n  got:      ${JSON.stringify(got)}`,
      );
    }
    const gotHash = createHash("sha256").update(got, "utf8").digest("hex");
    if (gotHash !== f.expectedSha256Hex) {
      throw new Error(
        `[${f.name}] sha256 mismatch\n  expected: ${f.expectedSha256Hex}\n  got:      ${gotHash}`,
      );
    }
  }
  for (const f of errorFixtures) {
    let threw = false;
    let message = "";
    try {
      canonicalize(f.buildInput());
    } catch (err) {
      threw = true;
      message = (err as Error).message;
    }
    if (!threw) {
      throw new Error(`[${f.name}] expected canonicalize() to throw, but it did not`);
    }
    if (!message.includes(f.expectedMessageContains)) {
      throw new Error(
        `[${f.name}] error message missing expected substring\n  expected to include: ${f.expectedMessageContains}\n  got: ${message}`,
      );
    }
  }
}

/**
 * Regenerate the `expectedCanonical` + `expectedSha256Hex` fields against
 * the current canonicalizer. Run this when bumping CANONICALIZATION_VERSION
 * to refresh the snapshots, then diff-review the output before committing.
 */
export function regenerate(): void {
  for (const f of fixtures) {
    let canonical: string;
    try {
      canonical = canonicalize(f.input);
    } catch (err) {
      if (err instanceof CanonicalError) {
        console.log(
          JSON.stringify({
            name: f.name,
            error: err.message,
          }),
        );
        continue;
      }
      throw err;
    }
    const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
    console.log(
      JSON.stringify({
        name: f.name,
        expectedCanonical: canonical,
        expectedSha256Hex: hash,
      }),
    );
  }
}
