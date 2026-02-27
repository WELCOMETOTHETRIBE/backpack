/**
 * Evidence freshness (CONMON) policy by layer. Computed at read time.
 */

export type FreshnessStatus = "fresh" | "stale" | "unknown";

const LAYER_FRESHNESS_DAYS: Record<string, number> = {
  "Identity/MFA": 30,
  "Identity/AuthN": 30,
  "Identity/Role-Governance": 30,
  "Logging/Collection": 30,
  "Logging/Monitoring": 30,
  "Logging/Retention": 90,
  "GuestOS/Patching": 30,
  "GuestOS/Hardening": 90,
  "Network/Boundary": 90,
  "Crypto/Key-Mgmt": 180,
  "Crypto/TLS": 180,
  "Backup/Recovery": 90,
};

export function getFreshnessDaysForLayer(layer: string | null): number | null {
  if (layer == null || layer === "") return null;
  const days = LAYER_FRESHNESS_DAYS[layer];
  return days ?? null;
}

export interface FreshnessResult {
  status: FreshnessStatus;
  freshness_days: number | null;
  freshness_cutoff_utc: string | null;
}

export function computeFreshnessStatus(
  createdAtIso: string,
  layer: string | null,
  now: Date = new Date()
): FreshnessResult {
  const days = getFreshnessDaysForLayer(layer);
  if (days == null) {
    return { status: "unknown", freshness_days: null, freshness_cutoff_utc: null };
  }
  const createdAt = new Date(createdAtIso);
  const cutoff = new Date(createdAt);
  cutoff.setUTCDate(cutoff.getUTCDate() + days);
  const cutoffIso = cutoff.toISOString();
  const isStale = now.getTime() > cutoff.getTime();
  return {
    status: isStale ? "stale" : "fresh",
    freshness_days: days,
    freshness_cutoff_utc: cutoffIso,
  };
}
