/**
 * Technical completion for enclave controls: passing + fresh finding from Windows hardening only.
 * Used by calculateControlStatus to allow implementationStatus = implemented when
 * evidenceFindings (pass=true) from the correct source and within freshness policy.
 */

import { eq, and, desc } from "drizzle-orm";
import { controlIdToNist } from "@/lib/compliance/controlId";
import { computeFreshnessStatus } from "@/lib/evidence/freshnessPolicy";
import { evidenceRuns, evidenceFindings } from "@/db/schema";

const WINDOWS_HARDENING_SOURCE = "windows_server_hardening";

export interface HasPassingFreshEnclaveFindingParams {
  db: typeof import("@/db").db;
  organizationId: string;
  controlNistId: string;
  layer: string | null;
  nowUtc?: string;
}

export interface HasPassingFreshEnclaveFindingResult {
  ok: boolean;
  reason?: "no_finding" | "stale_evidence" | "unknown_layer_freshness";
  runCollectedAt?: string;
  runFingerprint?: string;
  source?: string;
  freshness_status?: "fresh" | "stale" | "unknown";
  freshness_days?: number | null;
  freshness_cutoff_utc?: string | null;
}

/**
 * Returns whether the org has a passing, fresh enclave finding for the given control.
 * Only considers runs with source = windows_server_hardening.
 * Freshness is computed from layer policy. If layer is null/empty, returns ok=false (STRICT: do not credit) with reason unknown_layer_freshness and run details for troubleshooting.
 */
export async function hasPassingFreshEnclaveFinding(
  params: HasPassingFreshEnclaveFindingParams
): Promise<HasPassingFreshEnclaveFindingResult> {
  const { db, organizationId, controlNistId, layer, nowUtc } = params;

  const runsWithFindings = await db
    .select({
      runId: evidenceRuns.id,
      collectedAt: evidenceRuns.collectedAt,
      source: evidenceRuns.source,
      runFingerprint: evidenceRuns.runFingerprint,
      findingControlId: evidenceFindings.controlId,
      pass: evidenceFindings.pass,
    })
    .from(evidenceRuns)
    .innerJoin(evidenceFindings, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
    .where(
      and(
        eq(evidenceRuns.organizationId, organizationId),
        eq(evidenceRuns.source, WINDOWS_HARDENING_SOURCE),
        eq(evidenceFindings.pass, true)
      )
    )
    .orderBy(desc(evidenceRuns.collectedAt));

  const matchingRuns = runsWithFindings.filter((row) => {
    const nist = controlIdToNist(row.findingControlId ?? "");
    return nist === controlNistId;
  });

  if (matchingRuns.length === 0) {
    return { ok: false, reason: "no_finding" };
  }

  const mostRecent = matchingRuns[0];
  const collectedAt = mostRecent.collectedAt;
  const collectedAtIso =
    collectedAt instanceof Date ? collectedAt.toISOString() : String(collectedAt ?? "");
  const source = mostRecent.source ?? undefined;
  const runFingerprint = mostRecent.runFingerprint ?? undefined;

  const baseReturn = {
    runCollectedAt: collectedAtIso,
    runFingerprint,
    source,
  };

  if (layer == null || layer.trim() === "") {
    return {
      ok: false,
      reason: "unknown_layer_freshness",
      ...baseReturn,
      freshness_status: "unknown",
      freshness_days: null,
      freshness_cutoff_utc: null,
    };
  }

  const now = nowUtc ? new Date(nowUtc) : new Date();
  const freshness = computeFreshnessStatus(collectedAtIso, layer, now);

  if (freshness.status !== "fresh") {
    return {
      ok: false,
      reason: "stale_evidence",
      ...baseReturn,
      freshness_status: freshness.status,
      freshness_days: freshness.freshness_days,
      freshness_cutoff_utc: freshness.freshness_cutoff_utc,
    };
  }

  return {
    ok: true,
    ...baseReturn,
    freshness_status: "fresh",
    freshness_days: freshness.freshness_days,
    freshness_cutoff_utc: freshness.freshness_cutoff_utc,
  };
}
