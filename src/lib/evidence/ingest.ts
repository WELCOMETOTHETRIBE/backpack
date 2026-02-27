import { createHash } from "crypto";

export type InputsManifestEntry = {
  filename: string;
  sha256?: string;
  size?: number;
};

/**
 * Canonical hash of inputs list for fingerprinting. Sorted by filename for determinism.
 */
export function computeInputsManifestSha256(
  inputs: InputsManifestEntry[]
): string {
  const canonical = [...inputs].sort((a, b) =>
    (a.filename ?? "").localeCompare(b.filename ?? "")
  );
  const str = JSON.stringify(canonical);
  return createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Run fingerprint for idempotency: sha256(source|validator_sha256|inputs_manifest_sha256).
 */
export function computeRunFingerprint(params: {
  source: string;
  validator_sha256: string;
  inputs_manifest_sha256: string;
}): string {
  const payload =
    params.source +
    "|" +
    (params.validator_sha256 ?? "") +
    "|" +
    (params.inputs_manifest_sha256 ?? "");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
