import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * Vulnerability-management stats for the 3.11.2 / 3.11.3 SCTM widgets.
 *
 * Reads vuln_remediation register entries written by the
 * EnclaveWatch -> /api/registers/vuln-remediation/bulk-upsert pipeline
 * and computes:
 *   - Time-to-remediate distribution by severity (median, P95, count
 *     and SLA-breach count) -- used by the 3.11.3 widget
 *   - Regression count + most recent regression -- used by the
 *     register-page badge and the 3.11.3 widget
 *   - Per-source breakdown (mdvm | azure_update_manager |
 *     defender_for_cloud) -- used by the register-page provenance
 *     badges
 *   - Monthly scan-attestation freshness -- used by the 3.11.2 cadence
 *     pill ("scan stale" if no MDVM-SCAN-ATTESTATION-YYYYMM row exists
 *     for the current month after the 5th)
 *
 * Pure-ish: takes orgId, runs three queries, returns a typed
 * snapshot. Severity matching is case-insensitive and tolerates the
 * "unknown"/"none" values the bulk-upsert occasionally writes.
 */

export type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_NORM: Record<string, Severity | null> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  moderate: "medium",
  low: "low",
};

/** SLA targets in days. Default org policy; not yet configurable per-org. */
export const SLA_DAYS: Record<Severity, number> = {
  critical: 30,
  high: 90,
  medium: 180,
  low: 365,
};

export type TtrSeveritySlice = {
  severity: Severity;
  resolvedCount: number;
  medianDays: number | null;
  p95Days: number | null;
  slaBreachCount: number;
  slaDays: number;
};

export type SourceSlice = {
  source: string;
  total: number;
  open: number;
  resolved: number;
};

export type ScanAttestationStatus = {
  status: "current" | "stale" | "missing";
  /** ISO month for the most recent attestation row found, e.g. "2026-05". */
  latestPeriod: string | null;
  /** ISO month we expect to see by the 5th of next month. */
  expectedPeriod: string;
  /** Number of attestation rows total (sanity / trend). */
  totalAttestationRows: number;
};

export type VulnStats = {
  ttrBySeverity: TtrSeveritySlice[];
  /** Open critical+high count, surfaced on dashboards. */
  openCritical: number;
  openHigh: number;
  /** Regressions recorded across the org (regressed_at present). */
  regressionCount: number;
  /** Most recent regression timestamp (ISO) -- null if none. */
  latestRegressionAt: string | null;
  /** Per-source breakdown for provenance display. */
  bySource: SourceSlice[];
  /** Cadence freshness signal for 3.11.2. */
  scanAttestation: ScanAttestationStatus;
  /** Total entries (for sanity / "no data" handling). */
  totalEntries: number;
};

function median(sortedDays: number[]): number | null {
  if (sortedDays.length === 0) return null;
  const mid = Math.floor(sortedDays.length / 2);
  return sortedDays.length % 2 === 0
    ? (sortedDays[mid - 1] + sortedDays[mid]) / 2
    : sortedDays[mid];
}

function p95(sortedDays: number[]): number | null {
  if (sortedDays.length === 0) return null;
  const idx = Math.min(sortedDays.length - 1, Math.ceil(0.95 * sortedDays.length) - 1);
  return sortedDays[Math.max(0, idx)];
}

function expectedPeriodIso(now: Date = new Date()): string {
  // Prior month, since we expect attestation by the 5th of the *next* month.
  const ref = new Date(now.getFullYear(), now.getMonth(), 1);
  // If today is before the 5th, prior month's row is acceptable; otherwise we
  // expect the prior month's row to be present and treat its absence as stale.
  ref.setMonth(ref.getMonth() - 1);
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseAttestationPeriod(cveOrAttestationId: string): string | null {
  // Match MDVM-SCAN-ATTESTATION-YYYYMM (with optional dash variants).
  const m = cveOrAttestationId.match(/MDVM-SCAN-ATTESTATION-(\d{4})-?(\d{2})/i);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

export async function getVulnStatsForOrg(orgId: string): Promise<VulnStats | null> {
  // ── Resolve the org's vuln_remediation register ──
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) return null;

  const candidates = resolveRegisterKeyCandidates("vuln_remediation");
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!register) return null;

  const rows = await db
    .select({
      entryData: governanceRegisterEntries.entryData,
      status: governanceRegisterEntries.status,
      finalizedAt: governanceRegisterEntries.finalizedAt,
    })
    .from(governanceRegisterEntries)
    .where(eq(governanceRegisterEntries.registerId, register.id));

  // ── Build distributions + counts ──
  const daysBySeverity = new Map<Severity, number[]>();
  const slaBreachBySeverity = new Map<Severity, number>();
  const bySourceMap = new Map<string, SourceSlice>();
  let openCritical = 0;
  let openHigh = 0;
  let regressionCount = 0;
  let latestRegressionAt: string | null = null;

  let latestAttestationPeriod: string | null = null;
  let attestationRows = 0;

  for (const r of rows) {
    const d = (r.entryData ?? {}) as Record<string, unknown>;
    const cveId = String(d.cve_id ?? "");

    // Detect attestation-marker rows (no severity, no real CVE).
    const period = parseAttestationPeriod(cveId);
    if (period) {
      attestationRows++;
      if (!latestAttestationPeriod || period > latestAttestationPeriod) {
        latestAttestationPeriod = period;
      }
      continue;
    }

    const sev = SEVERITY_NORM[String(d.severity ?? "").toLowerCase()] ?? null;
    const source = String(d.source ?? "unknown");
    const slice = bySourceMap.get(source) ?? { source, total: 0, open: 0, resolved: 0 };
    slice.total++;
    const isResolved =
      r.status === "final" ||
      d.remediation_status === "resolved" ||
      Boolean(d.fixed_utc);
    if (isResolved) slice.resolved++;
    else slice.open++;
    bySourceMap.set(source, slice);

    if (!isResolved && sev === "critical") openCritical++;
    if (!isResolved && sev === "high") openHigh++;

    // Time-to-remediate when both timestamps are real strings.
    if (isResolved && sev) {
      const first = typeof d.first_detected_utc === "string" ? new Date(d.first_detected_utc) : null;
      const fixed =
        typeof d.fixed_utc === "string" && d.fixed_utc
          ? new Date(d.fixed_utc)
          : r.finalizedAt instanceof Date
            ? r.finalizedAt
            : null;
      if (first && fixed && !isNaN(first.getTime()) && !isNaN(fixed.getTime()) && fixed >= first) {
        const days = (fixed.getTime() - first.getTime()) / 86_400_000;
        const list = daysBySeverity.get(sev) ?? [];
        list.push(days);
        daysBySeverity.set(sev, list);
        if (days > SLA_DAYS[sev]) {
          slaBreachBySeverity.set(sev, (slaBreachBySeverity.get(sev) ?? 0) + 1);
        }
      }
    }

    // Regression bookkeeping.
    const ra = d.regressed_at;
    if (typeof ra === "string" && ra) {
      regressionCount += Math.max(1, Number(d.regression_count ?? 1));
      if (!latestRegressionAt || ra > latestRegressionAt) latestRegressionAt = ra;
    }
  }

  const ttrBySeverity: TtrSeveritySlice[] = (["critical", "high", "medium", "low"] as const).map(
    (sev) => {
      const arr = (daysBySeverity.get(sev) ?? []).slice().sort((a, b) => a - b);
      return {
        severity: sev,
        resolvedCount: arr.length,
        medianDays: median(arr),
        p95Days: p95(arr),
        slaBreachCount: slaBreachBySeverity.get(sev) ?? 0,
        slaDays: SLA_DAYS[sev],
      };
    },
  );

  // ── Cadence-freshness classification ──
  const expectedPeriod = expectedPeriodIso();
  const now = new Date();
  const dayOfMonth = now.getDate();
  let attestStatus: ScanAttestationStatus["status"];
  if (latestAttestationPeriod && latestAttestationPeriod >= expectedPeriod) {
    attestStatus = "current";
  } else if (!latestAttestationPeriod) {
    attestStatus = "missing";
  } else if (dayOfMonth <= 5) {
    // Grace period: prior-month attestation may not be in yet.
    attestStatus = "current";
  } else {
    attestStatus = "stale";
  }

  return {
    ttrBySeverity,
    openCritical,
    openHigh,
    regressionCount,
    latestRegressionAt,
    bySource: Array.from(bySourceMap.values()).sort((a, b) => b.total - a.total),
    scanAttestation: {
      status: attestStatus,
      latestPeriod: latestAttestationPeriod,
      expectedPeriod,
      totalAttestationRows: attestationRows,
    },
    totalEntries: rows.length - attestationRows,
  };
}

/** Source label / color tone (for badges). */
export const SOURCE_LABELS: Record<string, { label: string; description: string; tone: "blue" | "purple" | "amber" | "gray" }> = {
  mdvm: {
    label: "MDVM",
    description: "Microsoft Defender Vulnerability Management (Defender XDR / Plan 2).",
    tone: "blue",
  },
  azure_update_manager: {
    label: "Azure Update Manager",
    description: "Azure Update Manager REST API.",
    tone: "purple",
  },
  defender_for_cloud: {
    label: "Defender for Cloud",
    description: "Microsoft Defender for Cloud assessments.",
    tone: "amber",
  },
};

export function sourceMeta(source: string): { label: string; description: string; tone: "blue" | "purple" | "amber" | "gray" } {
  return SOURCE_LABELS[source] ?? { label: source, description: "Unknown collector source.", tone: "gray" };
}

/** SLA breach? Returns the SLA bucket if breached, null otherwise. */
export function ttrBreachLevel(severity: Severity, days: number): "breach" | "approaching" | "ok" {
  const sla = SLA_DAYS[severity];
  if (days > sla) return "breach";
  if (days > sla * 0.75) return "approaching";
  return "ok";
}
