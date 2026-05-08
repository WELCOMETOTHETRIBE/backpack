// Canonical JSON serialization for evidence records.
//
// VENDORING NOTE — this file is the canonical source for the
// canonicalizer used across the MacTech ecosystem. Other repos (Codex,
// future integrations) vendor a copy of THIS exact file and pin to a
// commit hash. The file is intentionally zero-deps so vendoring is a
// straight copy.
//
// If you change the format, bump CANONICALIZATION_VERSION below AND
// open a PR against any vendored copies you know about (Codex's lives
// at codex/src/lib/integrations/trainos/canonical.ts). Hash chains
// already in production reference the OLD bytes — never silently
// re-canonicalize stored evidence.
//
// AGENTS.md rule 1 + 5: the canonical JSON is the primary evidence and
// the hash chain is computed over its bytes. Same input must produce
// byte-identical output across runs, processes, and platforms.
//
// Rules:
//   • Object keys are sorted by UTF-16 code unit (the default
//     Array.prototype.sort over strings).
//   • No whitespace.
//   • Numbers are emitted via ECMAScript Number → String (the same
//     representation JSON.stringify uses for finite numbers).
//   • Strings are JSON-escaped via JSON.stringify, which already produces
//     the minimum escape form for valid JSON strings.
//   • Disallowed inputs throw — there is no silent normalization for things
//     like NaN, Infinity, -0, BigInt, Date, undefined, functions, or
//     Symbol values. Callers must convert to plain JSON-compatible values
//     before canonicalizing (Date → ISO string, BigInt → string, etc.).
//
// Aligned with RFC 8785 (JSON Canonicalization Scheme) for the subset of
// JSON we use. We don't claim full JCS compliance — we don't need it — but
// the wire format is intentionally a strict subset.

/**
 * Canonicalization format version. Stored verbatim in evidence
 * envelopes (`canonicalizationVersion: "v1"`) so consumers know which
 * format produced the bytes they're verifying. Bumping this string is
 * a breaking change — existing hashes can't be re-derived against a
 * different version.
 */
export const CANONICALIZATION_VERSION = "v1";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [k: string]: CanonicalValue };

/**
 * Serialize `value` to its canonical JSON form. Returns the string
 * representation; pass it through TextEncoder before hashing.
 */
export function canonicalize(value: unknown): string {
  return serialize(value, []);
}

/**
 * UTF-8 bytes of the canonical form. The bytes hashed by SHA-256.
 */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

function serialize(v: unknown, path: readonly (string | number)[]): string {
  if (v === null) return "null";

  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";

    case "number": {
      if (!Number.isFinite(v)) {
        throw new CanonicalError(
          `non-finite number (${v}) is not representable in canonical JSON`,
          path,
        );
      }
      // Object.is(-0, 0) is false; collapse to +0 so that semantically equal
      // inputs produce identical bytes.
      const n = Object.is(v, -0) ? 0 : v;
      return JSON.stringify(n);
    }

    case "string":
      return JSON.stringify(v);

    case "bigint":
      throw new CanonicalError(
        "BigInt is not representable in canonical JSON; convert to string before serializing",
        path,
      );

    case "undefined":
      throw new CanonicalError(
        "undefined is not a JSON value; use null for absent fields",
        path,
      );

    case "function":
    case "symbol":
      throw new CanonicalError(
        `${typeof v} is not a JSON value`,
        path,
      );
  }

  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) {
      parts.push(serialize(v[i], [...path, i]));
    }
    return "[" + parts.join(",") + "]";
  }

  // Plain object only. Reject things like Date, Map, Set, RegExp, class
  // instances — any structured type that JSON.stringify would silently
  // serialize as {} or via toJSON. Callers must convert to plain values.
  if (v !== null && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalError(
        `non-plain object (constructor ${(v as { constructor?: { name?: string } }).constructor?.name ?? "?"}) is not representable in canonical JSON`,
        path,
      );
    }

    const obj = v as Record<string, unknown>;
    // Sort by UTF-16 code unit. Default Array.prototype.sort over strings is
    // already a code-unit comparison; do not pass a custom comparator
    // (Intl.Collator is locale-sensitive and not deterministic).
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const value = obj[k];
      // Skip undefined values the way JSON.stringify does — but ONLY at the
      // object-property level. Inside arrays, undefined throws above.
      if (value === undefined) continue;
      parts.push(JSON.stringify(k) + ":" + serialize(value, [...path, k]));
    }
    return "{" + parts.join(",") + "}";
  }

  throw new CanonicalError(`unhandled value type ${typeof v}`, path);
}

export class CanonicalError extends Error {
  readonly path: readonly (string | number)[];
  constructor(message: string, path: readonly (string | number)[]) {
    super(formatPath(path) + ": " + message);
    this.name = "CanonicalError";
    this.path = path;
  }
}

function formatPath(path: readonly (string | number)[]): string {
  if (path.length === 0) return "<root>";
  let out = "<root>";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += `.${seg}`;
  }
  return out;
}
