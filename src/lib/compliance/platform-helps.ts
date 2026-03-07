/**
 * Per-control "How this platform helps" text for assessment guide.
 * Uses curated platform_helps_by_control.v1.json when present; otherwise generic fallback.
 */

import platformHelpsJson from "@/data/cmmc/platform_helps_by_control.v1.json";

const platformHelps = (platformHelpsJson as { platform_helps?: Record<string, string> }).platform_helps ?? {};

/** Generic fallback when no per-control text is defined (no overclaiming). */
export const PLATFORM_HELP_FALLBACK =
  "This control plane helps you manage control status, upload evidence bundles and governance documents, map documents to the governance matrix, and view drift (regressions) from previous evidence runs. Use Evidence and Evidence Library for attestations and technical evidence.";

/**
 * Returns the "How this platform helps" body for a control.
 * Uses per-control curated text when available; otherwise the generic fallback.
 */
export function getPlatformHelpForControl(controlId: string): string {
  const normalized = controlId.replace(/^[A-Z]+\.L2-/, "");
  return platformHelps[controlId] ?? platformHelps[normalized] ?? PLATFORM_HELP_FALLBACK;
}
