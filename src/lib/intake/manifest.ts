import { createHash } from "node:crypto";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

const SECRET_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /private[_-]?key/i,
  /sas/i,
  /signature/i,
];

function sortJson(value: JsonLike): JsonLike {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const out: { [key: string]: JsonLike } = {};
    for (const [key, item] of sortedEntries) out[key] = sortJson(item);
    return out;
  }
  return value;
}

function sanitizeJson(value: JsonLike): JsonLike {
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (value && typeof value === "object") {
    const out: { [key: string]: JsonLike } = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        out[key] = "REDACTED";
      } else {
        out[key] = sanitizeJson(item);
      }
    }
    return out;
  }
  if (typeof value === "string") {
    return value
      .replace(/([?&](sig|signature|token|se|sp|sr|skoid|sktid|skt|ske)=)[^&]+/gi, "$1REDACTED")
      .replace(/(sas|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=REDACTED");
  }
  return value;
}

export function canonicalizeManifest(
  manifest: Record<string, unknown>,
): string {
  const sanitized = sanitizeJson(manifest as JsonLike);
  return JSON.stringify(sortJson(sanitized));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildManifestWithHash(manifest: Record<string, unknown>): {
  canonicalJson: string;
  manifestHash: string;
} {
  const canonicalJson = canonicalizeManifest(manifest);
  const manifestHash = sha256Hex(canonicalJson);
  return { canonicalJson, manifestHash };
}
