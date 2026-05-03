import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFindings,
  governanceRegisterEntries,
  governanceRegisters,
  boundaries,
} from "@/db/schema";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import Link from "next/link";
import {
  Activity,
  Cloud,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  ClockAlert,
  ExternalLink,
  Shield,
  Bug,
  Wrench,
  ListChecks,
} from "lucide-react";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";

/**
 * Continuous Monitoring (3.12.3) — operational dashboard for the
 * MacTech EnclaveWatch program. Replaces the old static "controls due
 * for review + evidence expiring" view, which was a calendar reminder
 * not a real continuous-monitoring signal.
 *
 * The page reads four evidenceRuns sources that EnclaveWatch posts into
 * the Codex on every weekly cadence:
 *   - cui_evidence_manifest    (OS evidence bundle from Collect-Cui-Evidence-v2)
 *   - windows_server_hardening (OS validator from Test-CuiHardening)
 *   - azure_entra              (Azure validator from validate_azure_entra)
 *   - enclavewatch_weekly_review (signed ISSO weekly acknowledgement)
 *
 * Per-source freshness is the heartbeat: weekly cadence -> green ≤ 8 d,
 * amber 8-21 d, red > 21 d (or never). Drift signal is computed by
 * comparing the latest run's findings against the prior run.
 */

const SOURCES = [
  { key: "cui_evidence_manifest", label: "OS Evidence Bundle", subtitle: "Collect-Cui-Evidence-v2", icon: HardDrive },
  { key: "windows_server_hardening", label: "OS Validator", subtitle: "Test-CuiHardening (53 checks)", icon: ShieldCheck },
  { key: "azure_entra", label: "Azure Validator", subtitle: "validate_azure_entra (15 controls)", icon: Cloud },
  { key: "enclavewatch_weekly_review", label: "ISSO Weekly Review", subtitle: "Signed acknowledgement", icon: Activity },
] as const;

const FRESHNESS_GREEN_DAYS = 8;
const FRESHNESS_AMBER_DAYS = 21;

function freshness(daysSinceLastRun: number | null): "green" | "amber" | "red" {
  if (daysSinceLastRun === null) return "red";
  if (daysSinceLastRun <= FRESHNESS_GREEN_DAYS) return "green";
  if (daysSinceLastRun <= FRESHNESS_AMBER_DAYS) return "amber";
  return "red";
}

function freshnessClasses(f: "green" | "amber" | "red"): { dot: string; pill: string; ring: string } {
  if (f === "green") return { dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-800 border-emerald-200", ring: "ring-emerald-200" };
  if (f === "amber") return { dot: "bg-amber-500", pill: "bg-amber-100 text-amber-800 border-amber-200", ring: "ring-amber-200" };
  return { dot: "bg-red-500", pill: "bg-red-100 text-red-700 border-red-200", ring: "ring-red-200" };
}

function freshnessLabel(daysSinceLastRun: number | null): string {
  if (daysSinceLastRun === null) return "Never run";
  if (daysSinceLastRun === 0) return "Today";
  if (daysSinceLastRun === 1) return "Yesterday";
  if (daysSinceLastRun < 30) return `${daysSinceLastRun}d ago`;
  const months = Math.floor(daysSinceLastRun / 30);
  return `${months}mo ago`;
}

type RunRow = {
  id: string;
  runId: string;
  source: string;
  collectedAt: Date;
  bundleRoot: string;
  pass: number;
  partial: number;
  fail: number;
};

export default async function MonitoringPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const allRuns = await db
    .select({
      id: evidenceRuns.id,
      runId: evidenceRuns.runId,
      source: evidenceRuns.source,
      collectedAt: evidenceRuns.collectedAt,
      bundleRoot: evidenceRuns.bundleRoot,
    })
    .from(evidenceRuns)
    .where(eq(evidenceRuns.organizationId, orgId))
    .orderBy(desc(evidenceRuns.collectedAt));

  const findingCounts = await db
    .select({
      runId: evidenceFindings.evidenceRunId,
      pass: sql<number>`count(*) filter (where ${evidenceFindings.pass} = true and ${evidenceFindings.partial} = false)::int`,
      partial: sql<number>`count(*) filter (where ${evidenceFindings.partial} = true)::int`,
      fail: sql<number>`count(*) filter (where ${evidenceFindings.pass} = false and ${evidenceFindings.partial} = false)::int`,
    })
    .from(evidenceFindings)
    .innerJoin(evidenceRuns, eq(evidenceFindings.evidenceRunId, evidenceRuns.id))
    .where(eq(evidenceRuns.organizationId, orgId))
    .groupBy(evidenceFindings.evidenceRunId);

  const findingsByRun = new Map(findingCounts.map((f) => [f.runId, f]));

  const runs: RunRow[] = allRuns.map((r) => {
    const f = findingsByRun.get(r.id);
    return {
      id: r.id,
      runId: r.runId,
      source: r.source,
      collectedAt: r.collectedAt,
      bundleRoot: r.bundleRoot ?? "",
      pass: f?.pass ?? 0,
      partial: f?.partial ?? 0,
      fail: f?.fail ?? 0,
    };
  });

  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const perSource = SOURCES.map((s) => {
    const sourceRuns = runs.filter((r) => r.source === s.key);
    const latest = sourceRuns[0] ?? null;
    const previous = sourceRuns[1] ?? null;
    const daysSince = latest ? Math.floor((now - latest.collectedAt.getTime()) / MS_PER_DAY) : null;
    return {
      ...s,
      latest,
      previous,
      daysSince,
      freshness: freshness(daysSince),
      runCount: sourceRuns.length,
    };
  });

  // ── Host vitals (parsed from latest OS validator findings + vuln register) ──
  // Each card's source: see comment per metric. All data is already in the
  // codex (no new collectors). Parsed live on every page render so the
  // numbers always reflect the latest cadence run.
  const latestOsValidatorRun = perSource.find((s) => s.key === "windows_server_hardening")?.latest;
  let osValidatorFindings: { controlId: string; pass: boolean; observed: string }[] = [];
  if (latestOsValidatorRun) {
    osValidatorFindings = await db
      .select({ controlId: evidenceFindings.controlId, pass: evidenceFindings.pass, observed: evidenceFindings.observed })
      .from(evidenceFindings)
      .where(eq(evidenceFindings.evidenceRunId, latestOsValidatorRun.id));
  }
  const findingByControl = new Map(osValidatorFindings.map((f) => [f.controlId, f]));

  // 1. AV signature age — parse `AntivirusSignatureAge=N` from 3.14.4
  const avFinding = findingByControl.get("3.14.4");
  const avAgeMatch = avFinding?.observed.match(/AntivirusSignatureAge=(\d+)/i);
  const avAgeDays = avAgeMatch ? parseInt(avAgeMatch[1], 10) : null;

  // 2. OS patch state — proxy via 3.14.1 update-services check until we
  // capture actual "days since last successful WU install" in the
  // canonical evidence bundle. PASS = update services healthy, can patch.
  const wuFinding = findingByControl.get("3.14.1");
  const wuPass = wuFinding?.pass ?? null;

  // 3. Open critical + high CVEs — count vuln_remediation register entries
  // with status=draft AND severity ∈ (critical, high). Will be 0 until
  // EnclaveWatch's MDVM collector starts pushing.
  const orgBoundaryRows = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const vulnRegCandidates = resolveRegisterKeyCandidates("vuln_remediation");
  let openCriticalHigh = 0;
  let totalVulnEntries = 0;
  if (orgBoundaryRows.length > 0 && vulnRegCandidates.length > 0) {
    const [vulnReg] = await db
      .select({ id: governanceRegisters.id })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          sql`${governanceRegisters.registerKey} IN (${sql.join(
            vulnRegCandidates.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      )
      .limit(1);
    if (vulnReg) {
      const entries = await db
        .select({ entryData: governanceRegisterEntries.entryData, status: governanceRegisterEntries.status })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, vulnReg.id),
            inArray(
              governanceRegisterEntries.boundaryId,
              orgBoundaryRows.map((b) => b.id),
            ),
          ),
        );
      totalVulnEntries = entries.length;
      for (const e of entries) {
        if (e.status === "draft") {
          const sev = ((e.entryData ?? {}) as { severity?: string }).severity?.toLowerCase();
          if (sev === "critical" || sev === "high") openCriticalHigh++;
        }
      }
    }
  }

  // 4. Hardening baseline — pass count / total for the latest OS validator run
  const hardeningPass = latestOsValidatorRun?.pass ?? 0;
  const hardeningTotal = latestOsValidatorRun
    ? latestOsValidatorRun.pass + latestOsValidatorRun.partial + latestOsValidatorRun.fail
    : 0;

  // Drift signal: prefer Azure validator (most change-prone surface);
  // fall back to OS validator. OS bundle has 0 findings on its own runs
  // (it's a manifest, not a check) so it can't drive drift.
  const driftSource =
    perSource.find((s) => s.key === "azure_entra" && s.latest && s.previous) ??
    perSource.find((s) => s.key === "windows_server_hardening" && s.latest && s.previous) ??
    null;
  const drift =
    driftSource && driftSource.latest && driftSource.previous
      ? {
          source: driftSource.label,
          passDelta: driftSource.latest.pass - driftSource.previous.pass,
          partialDelta: driftSource.latest.partial - driftSource.previous.partial,
          failDelta: driftSource.latest.fail - driftSource.previous.fail,
          priorRunId: driftSource.previous.runId,
          currentRunId: driftSource.latest.runId,
        }
      : null;

  const recentRuns = runs.slice(0, 15);
  const totalRuns = runs.length;

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  // Cadence health is judged separately from the ISSO weekly review.
  // The 3 automated sources (OS bundle, OS validator, Azure validator)
  // arm via cron on the vault. The ISSO weekly review is a manual
  // human action and may legitimately not have fired yet on a fresh
  // deployment -- that's not a "cadence not armed" condition, it's an
  // "awaiting first signature" condition.
  const automatedSources = perSource.filter((s) => s.key !== "enclavewatch_weekly_review");
  const issoSource = perSource.find((s) => s.key === "enclavewatch_weekly_review");
  const automatedArmed = automatedSources.every((s) => s.runCount > 0);
  const automatedAllGreen = automatedSources.every((s) => s.freshness === "green");
  const automatedAnyRed = automatedSources.some((s) => s.freshness === "red");
  const issoNeverRun = issoSource?.runCount === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <Activity className="h-6 w-6 text-[var(--color-blue-accent)]" aria-hidden />
          <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">Continuous Monitoring</h1>
          {!automatedArmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              Cadence not yet armed
            </span>
          )}
          {automatedArmed && automatedAnyRed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
              <AlertTriangle className="h-3 w-3" /> Cadence stale
            </span>
          )}
          {automatedArmed && !automatedAnyRed && automatedAllGreen && issoNeverRun && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              <Activity className="h-3 w-3" /> Cadence healthy · awaiting first ISSO sign-off
            </span>
          )}
          {automatedArmed && !automatedAnyRed && automatedAllGreen && !issoNeverRun && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3" /> Program healthy
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-[var(--color-gray-600)]">
          MacTech <strong>EnclaveWatch</strong> is the operational program for NIST 800-171 §3.12.3.
          It runs the canonical evidence collectors + validators inside the CUI Vault on weekly
          cadence and pushes signed metadata-only acknowledgements to the Codex (raw audit data
          never leaves the boundary). This page surfaces the heartbeat, history, and drift across
          all four cadence sources.
        </p>
      </header>

      {/* ── Section 1: Program health (4 source pills) ─────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Program health
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perSource.map((s) => {
            const cls = freshnessClasses(s.freshness);
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={`${cardClass} relative ring-2 ring-offset-2 ring-offset-[var(--color-bg)] ${cls.ring}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Icon className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                    {freshnessLabel(s.daysSince)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--color-navy-primary)]">
                  {s.label}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-gray-500)]">{s.subtitle}</p>
                {s.latest ? (
                  <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-gray-600)]">
                    <span>
                      <span className="font-semibold text-emerald-700">{s.latest.pass}</span>{" "}
                      <span className="text-[var(--color-gray-500)]">pass</span>
                    </span>
                    {s.latest.partial > 0 && (
                      <span>
                        <span className="font-semibold text-blue-700">{s.latest.partial}</span>{" "}
                        <span className="text-[var(--color-gray-500)]">partial</span>
                      </span>
                    )}
                    {s.latest.fail > 0 && (
                      <span>
                        <span className="font-semibold text-amber-700">{s.latest.fail}</span>{" "}
                        <span className="text-[var(--color-gray-500)]">fail</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs italic text-[var(--color-gray-500)]">
                    Awaiting first cadence run
                  </p>
                )}
                <p className="mt-3 text-[11px] text-[var(--color-gray-400)]">
                  {s.runCount} run{s.runCount === 1 ? "" : "s"} on file
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section 2: Host vitals (live signals an assessor opens with) ── */}
      {latestOsValidatorRun && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Host vitals
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <VitalCard
              icon={Shield}
              label="AV definitions"
              control="SI 3.14.4"
              value={avAgeDays === null ? "—" : `${avAgeDays}d`}
              valueLabel={avAgeDays === null ? "Not captured" : avAgeDays === 0 ? "current today" : avAgeDays === 1 ? "1 day old" : `${avAgeDays} days old`}
              tone={avAgeDays === null ? "neutral" : avAgeDays <= 7 ? "good" : avAgeDays <= 14 ? "warn" : "bad"}
              hint="Microsoft Defender signature age — assessor-relevant for malicious code protection"
            />
            <VitalCard
              icon={Wrench}
              label="OS patch posture"
              control="SI 3.14.1"
              value={wuPass === null ? "—" : wuPass ? "Healthy" : "Stalled"}
              valueLabel={wuPass === null ? "No data yet" : wuPass ? "wuauserv + bits ready" : "Update services not running"}
              tone={wuPass === null ? "neutral" : wuPass ? "good" : "bad"}
              hint="Windows Update services state — proxy for flaw remediation cadence (real day-count comes when EnclaveWatch captures WU history)"
            />
            <VitalCard
              icon={Bug}
              label="Open Critical+High CVEs"
              control="3.11.2 / 3.11.3"
              value={totalVulnEntries === 0 ? "—" : String(openCriticalHigh)}
              valueLabel={totalVulnEntries === 0 ? "Awaiting first MDVM cadence" : openCriticalHigh === 0 ? "no high-severity open" : "needs remediation"}
              tone={totalVulnEntries === 0 ? "neutral" : openCriticalHigh === 0 ? "good" : openCriticalHigh <= 3 ? "warn" : "bad"}
              hint="Defender Vulnerability Management feed via EnclaveWatch — count of unresolved CVEs at severity ≥ high"
            />
            <VitalCard
              icon={ListChecks}
              label="Hardening baseline"
              control="composite"
              value={hardeningTotal === 0 ? "—" : `${hardeningPass}/${hardeningTotal}`}
              valueLabel={hardeningTotal === 0 ? "No validator run yet" : hardeningPass === hardeningTotal ? "all checks pass" : `${hardeningTotal - hardeningPass} not passing`}
              tone={hardeningTotal === 0 ? "neutral" : hardeningPass === hardeningTotal ? "good" : "warn"}
              hint="Test-CuiHardening per-check PASS / total — single-glance baseline integrity"
            />
          </div>
        </section>
      )}

      {/* ── Section 3: Drift signal ───────────────────────────────── */}
      {drift && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Drift since last cycle
          </h2>
          <div className={cardClass}>
            <div className="flex items-start gap-3">
              <ClockAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-blue-accent)]" aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--color-navy-primary)]">
                  {drift.source}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  Comparing run{" "}
                  <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
                    {drift.priorRunId.slice(0, 28)}…
                  </code>{" "}
                  against{" "}
                  <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
                    {drift.currentRunId.slice(0, 28)}…
                  </code>
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <DriftCell label="PASS Δ" delta={drift.passDelta} positiveIsGood />
                  <DriftCell label="PARTIAL Δ" delta={drift.partialDelta} positiveIsGood={false} />
                  <DriftCell label="FAIL Δ" delta={drift.failDelta} positiveIsGood={false} />
                </div>
                {drift.passDelta === 0 && drift.partialDelta === 0 && drift.failDelta === 0 && (
                  <p className="mt-3 text-xs text-[var(--color-gray-500)]">
                    No change in the validator finding set since the prior cycle. Steady state.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 3: Cadence history (last 15 runs) ─────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Cadence history
          </h2>
          {totalRuns > recentRuns.length && (
            <Link
              href="/dashboard/evidence/upload-manifest"
              className="text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View all {totalRuns} uploads <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </Link>
          )}
        </div>
        <div className={`${cardClass} overflow-hidden p-0`}>
          {recentRuns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <CircleSlash className="h-8 w-8 text-[var(--color-gray-400)]" />
              <p className="text-sm font-medium text-[var(--color-gray-700)]">
                No cadence runs yet
              </p>
              <p className="max-w-md text-xs text-[var(--color-gray-500)]">
                EnclaveWatch hasn&apos;t pushed any evidence to the codex yet. Verify the vault
                service is running and the configured Codex bearer token resolves
                (<code className="font-mono text-[10px]">/api/auth/me</code> on the vault side).
                The weekly cron fires Sundays at 02:00 vault-local.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-4 py-2.5">Source</th>
                    <th className="px-4 py-2.5">Run ID</th>
                    <th className="px-4 py-2.5">Collected</th>
                    <th className="px-4 py-2.5 text-right">PASS</th>
                    <th className="px-4 py-2.5 text-right">PARTIAL</th>
                    <th className="px-4 py-2.5 text-right">FAIL</th>
                    <th className="px-4 py-2.5">Bundle</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    const sourceMeta = SOURCES.find((s) => s.key === r.source);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--color-border)] last:border-none hover:bg-[var(--color-surface-muted)]/50"
                      >
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gray-700)]">
                            {sourceMeta?.label ?? r.source}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-gray-700)]">
                          {r.runId}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--color-gray-600)]">
                          {r.collectedAt.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.pass > 0 ? (
                            <span className="font-semibold text-emerald-700">{r.pass}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.partial > 0 ? (
                            <span className="font-semibold text-blue-700">{r.partial}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {r.fail > 0 ? (
                            <span className="font-semibold text-amber-700">{r.fail}</span>
                          ) : (
                            <span className="text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--color-gray-500)] truncate max-w-[200px]">
                          {r.bundleRoot || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer note: what an assessor sees ──────────────────────── */}
      <p className="text-xs text-[var(--color-gray-500)]">
        For the C3PAO assessor: this page is the operational record of the EnclaveWatch
        continuous-monitoring program. The signed{" "}
        <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
          enclavewatch_audit_program
        </code>{" "}
        attestation (visible on the{" "}
        <Link href="/dashboard/artifacts" className="text-[var(--color-blue-accent)] hover:underline">
          Artifacts page
        </Link>
        ) is the customer&apos;s declaration; the rows above are the operational evidence that
        the program actually ran.
      </p>
    </div>
  );
}

function VitalCard({
  icon: Icon,
  label,
  control,
  value,
  valueLabel,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  control: string;
  value: string;
  valueLabel: string;
  tone: "good" | "warn" | "bad" | "neutral";
  hint: string;
}) {
  const toneClass =
    tone === "good"
      ? { ring: "ring-emerald-200", value: "text-emerald-700", dot: "bg-emerald-500" }
      : tone === "warn"
        ? { ring: "ring-amber-200", value: "text-amber-700", dot: "bg-amber-500" }
        : tone === "bad"
          ? { ring: "ring-red-200", value: "text-red-700", dot: "bg-red-500" }
          : { ring: "ring-slate-200", value: "text-slate-500", dot: "bg-slate-400" };
  return (
    <div
      className={`rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm ring-2 ring-offset-2 ring-offset-[var(--color-bg)] ${toneClass.ring}`}
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-600)]">
          <span className={`h-1.5 w-1.5 rounded-full ${toneClass.dot}`} />
          {control}
        </span>
      </div>
      <p className={`mt-3 text-3xl font-bold tabular-nums ${toneClass.value}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-navy-primary)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--color-gray-500)]">{valueLabel}</p>
    </div>
  );
}

function DriftCell({
  label,
  delta,
  positiveIsGood,
}: {
  label: string;
  delta: number;
  positiveIsGood: boolean;
}) {
  const sign = delta > 0 ? "+" : "";
  const good = positiveIsGood ? delta >= 0 : delta <= 0;
  const colorClass =
    delta === 0
      ? "text-[var(--color-gray-600)]"
      : good
        ? "text-emerald-700"
        : "text-amber-700";
  return (
    <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${colorClass}`}>
        {sign}
        {delta}
      </p>
    </div>
  );
}
