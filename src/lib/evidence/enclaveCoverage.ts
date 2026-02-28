/**
 * Enclave evidence coverage: maps a Windows hardening run to the 73-enclave control set
 * with PASS/FAIL/STALE/UNKNOWN-LAYER/NO-FINDING buckets and actionable gaps.
 */

import { eq } from "drizzle-orm";
import { evidenceRuns } from "@/db/schema";
import { getEnclaveMappedControls } from "@/lib/compliance/enclaveManifest";
import { getRunFindingsByControl } from "@/lib/evidence/bulkFindings";
import { computeFreshnessStatus } from "@/lib/evidence/freshnessPolicy";
import { getControlLayerMapFromLatestSnapshot } from "@/lib/boundary/getControlLayerMap";

export type CoverageBucket =
  | "pass_fresh"
  | "pass_stale"
  | "pass_unknown_layer"
  | "fail"
  | "no_finding";

export interface EnclaveCoverageRow {
  control_id: string;
  finding?: {
    pass: boolean;
    observed?: string;
    expected?: string;
    evidence_hint?: string;
    evidence_files_used?: string[];
  };
  layer: string | null;
  bucket: CoverageBucket;
  freshness_status: "fresh" | "stale" | "unknown" | "n/a";
  freshness_days: number | null;
  freshness_cutoff_utc: string | null;
  remediation_hint?: string;
}

export interface EnclaveCoverageSummary {
  source: string;
  evidence_run_id: string;
  run_fingerprint: string;
  collected_at: string;
  totals: {
    enclave_controls: number;
    pass_fresh: number;
    pass_stale: number;
    pass_unknown_layer: number;
    fail: number;
    no_finding: number;
  };
  rows: EnclaveCoverageRow[];
  top_gaps: {
    unknown_layer: string[];
    stale: string[];
    failed: string[];
    no_finding: string[];
  };
}

const TOP_GAPS_LIMIT = 10;

export async function computeEnclaveCoverage(params: {
  db: any;
  organizationId: string;
  accountId: string;
  boundaryId: string;
  evidenceRunId: string;
  source: string;
  nowUtc?: string;
}): Promise<EnclaveCoverageSummary> {
  const {
    db,
    organizationId,
    accountId,
    boundaryId,
    evidenceRunId,
    source,
    nowUtc,
  } = params;
  const now = nowUtc ? new Date(nowUtc) : new Date();

  const enclaveControls = getEnclaveMappedControls();
  const sortedControlIds = [...enclaveControls].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  const [findingsMap, layerMap, runRows] = await Promise.all([
    getRunFindingsByControl({ db, organizationId, evidenceRunId }),
    getControlLayerMapFromLatestSnapshot({ db, accountId, boundaryId }),
    db
      .select({ collectedAt: evidenceRuns.collectedAt, runFingerprint: evidenceRuns.runFingerprint })
      .from(evidenceRuns)
      .where(eq(evidenceRuns.id, evidenceRunId))
      .limit(1),
  ]);
  const runRow = runRows[0] ?? null;

  const collectedAtIso =
    runRow?.collectedAt instanceof Date
      ? runRow.collectedAt.toISOString()
      : (runRow?.collectedAt ? String(runRow.collectedAt) : new Date().toISOString());
  const runFingerprint = runRow?.runFingerprint ?? "";

  const totals = {
    enclave_controls: sortedControlIds.length,
    pass_fresh: 0,
    pass_stale: 0,
    pass_unknown_layer: 0,
    fail: 0,
    no_finding: 0,
  };

  const topGaps = {
    unknown_layer: [] as string[],
    stale: [] as string[],
    failed: [] as string[],
    no_finding: [] as string[],
  };

  const rows: EnclaveCoverageRow[] = [];

  for (const control_id of sortedControlIds) {
    const finding = findingsMap.get(control_id);
    const layer = layerMap.get(control_id) ?? null;

    if (!finding) {
      rows.push({
        control_id,
        layer,
        bucket: "no_finding",
        freshness_status: "n/a",
        freshness_days: null,
        freshness_cutoff_utc: null,
        remediation_hint: "Run does not include a finding for this control (check validator mapping).",
      });
      totals.no_finding++;
      if (topGaps.no_finding.length < TOP_GAPS_LIMIT) topGaps.no_finding.push(control_id);
      continue;
    }

    if (finding.pass === false) {
      rows.push({
        control_id,
        finding: {
          pass: false,
          observed: finding.observed,
          expected: finding.expected,
          evidence_hint: finding.evidence_hint,
          evidence_files_used: finding.evidence_files_used,
        },
        layer,
        bucket: "fail",
        freshness_status: "n/a",
        freshness_days: null,
        freshness_cutoff_utc: null,
        remediation_hint: "Remediate host configuration and re-run validator.",
      });
      totals.fail++;
      if (topGaps.failed.length < TOP_GAPS_LIMIT) topGaps.failed.push(control_id);
      continue;
    }

    if (layer == null || layer === "") {
      rows.push({
        control_id,
        finding: {
          pass: true,
          observed: finding.observed,
          expected: finding.expected,
          evidence_hint: finding.evidence_hint,
          evidence_files_used: finding.evidence_files_used,
        },
        layer: null,
        bucket: "pass_unknown_layer",
        freshness_status: "unknown",
        freshness_days: null,
        freshness_cutoff_utc: null,
        remediation_hint: "Map this control to an ontology layer so freshness can be evaluated.",
      });
      totals.pass_unknown_layer++;
      if (topGaps.unknown_layer.length < TOP_GAPS_LIMIT) topGaps.unknown_layer.push(control_id);
      continue;
    }

    const freshness = computeFreshnessStatus(collectedAtIso, layer, now);
    if (freshness.status === "fresh") {
      rows.push({
        control_id,
        finding: {
          pass: true,
          observed: finding.observed,
          expected: finding.expected,
          evidence_hint: finding.evidence_hint,
          evidence_files_used: finding.evidence_files_used,
        },
        layer,
        bucket: "pass_fresh",
        freshness_status: "fresh",
        freshness_days: freshness.freshness_days,
        freshness_cutoff_utc: freshness.freshness_cutoff_utc,
      });
      totals.pass_fresh++;
    } else {
      rows.push({
        control_id,
        finding: {
          pass: true,
          observed: finding.observed,
          expected: finding.expected,
          evidence_hint: finding.evidence_hint,
          evidence_files_used: finding.evidence_files_used,
        },
        layer,
        bucket: "pass_stale",
        freshness_status: "stale",
        freshness_days: freshness.freshness_days,
        freshness_cutoff_utc: freshness.freshness_cutoff_utc,
        remediation_hint: "Re-run evidence collection to meet freshness policy.",
      });
      totals.pass_stale++;
      if (topGaps.stale.length < TOP_GAPS_LIMIT) topGaps.stale.push(control_id);
    }
  }

  return {
    source,
    evidence_run_id: evidenceRunId,
    run_fingerprint: runFingerprint,
    collected_at: collectedAtIso,
    totals,
    rows,
    top_gaps: topGaps,
  };
}
