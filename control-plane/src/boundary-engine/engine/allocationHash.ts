import crypto from "crypto";
import type { BoundaryInput } from "../types";

/**
 * Returns a deterministic SHA-256 hex hash of the allocation inputs for audit stability
 * and change detection (e.g. governance freeze).
 */
export function computeAllocationHash(
  profile_id: string,
  ontology_version: string,
  boundaryInput: BoundaryInput,
  registry_version: string
): string {
  const payload = {
    profile_id,
    ontology_version,
    boundaryInput: canonicalize(boundaryInput),
    registry_version: registry_version ?? "",
  };
  const json = JSON.stringify(canonicalize(payload));
  return crypto.createHash("sha256").update(json).digest("hex");
}

/** Recursively sort object keys for deterministic JSON. */
function canonicalize(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}
