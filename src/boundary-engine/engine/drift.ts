/**
 * Lightweight drift detection: compare previous allocation hash with newly computed hash.
 */
export function detectBoundaryDrift(
  prevHash: string | null,
  newHash: string
): { drifted: boolean; reason: "hash_changed" | "none" } {
  const drifted = prevHash != null && prevHash !== newHash;
  return {
    drifted,
    reason: drifted ? "hash_changed" : "none",
  };
}
