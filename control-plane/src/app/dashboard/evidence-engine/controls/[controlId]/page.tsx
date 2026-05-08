import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEvidenceMap } from "@/data/cmmc";
import { getRegisterStatsForOrgAndBoundary } from "@/lib/evidence-engine/control-dashboard";
import { getResponsibilityForControl } from "@/lib/evidence-engine/responsibilities";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";
import { getCombinedTechnicalStatus } from "@/lib/evidence-engine/technical-runs";
import { getVulnStatsForOrg, ttrBreachLevel, type VulnStats } from "@/lib/sctm/vuln-stats";

type PageProps = { params: Promise<{ controlId: string }>; searchParams: Promise<{ boundary?: string }> };

function buildBaseQuery(boundaryId: string | null) {
  return boundaryId ? `?boundary=${encodeURIComponent(boundaryId)}` : "";
}

export default async function EvidenceEngineControlDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { controlId } = await params;
  const { boundary: boundaryParam } = await searchParams;
  const { effectiveBoundaryId, boundaries } = await resolveEffectiveBoundary(orgId, boundaryParam);

  const evidenceMap = getEvidenceMap();
  const controlMeta = evidenceMap.controls.find((c) => c.control_id === controlId);
  if (!controlMeta) notFound();

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine" className="text-sm text-[var(--color-gray-600)] hover:underline">← Evidence Engine</Link>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Control {controlId}</h1>
        <p className="text-[var(--color-gray-600)]">No system boundary is configured for this organization.</p>
        <Link href="/dashboard/boundary" className="text-sm text-[var(--color-blue-accent)] hover:underline">Open System Boundary</Link>
      </div>
    );
  }

  const isVulnControl = controlId === "3.11.2" || controlId === "3.11.3";
  const [responsibility, statsByRegister, vulnStats] = await Promise.all([
    getResponsibilityForControl(orgId, controlId, effectiveBoundaryId),
    getRegisterStatsForOrgAndBoundary(orgId, effectiveBoundaryId),
    isVulnControl ? getVulnStatsForOrg(orgId) : Promise.resolve(null),
  ]);
  const technicalStatus = await getCombinedTechnicalStatus(
    effectiveBoundaryId,
    controlId,
    responsibility?.responsibilityModel ?? null
  );

  const registers = controlMeta.registers ?? [];
  const registerNameById = new Map(evidenceMap.registers.map((r) => [r.id, r.name]));
  const baseQuery = buildBaseQuery(effectiveBoundaryId);
  const effectiveBoundaryName = boundaries.find((b) => b.id === effectiveBoundaryId)?.name ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/evidence-engine${baseQuery}`}
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Evidence Engine
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Control {controlId}
        </h1>
        {effectiveBoundaryName && (
          <p className="mt-0.5 text-sm font-medium text-[var(--color-gray-700)]">
            Boundary: {effectiveBoundaryName}
          </p>
        )}
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          {controlMeta.family} · Responsibility: {responsibility?.responsibilityModel ? formatResponsibility(responsibility.responsibilityModel) : "—"}
        </p>
      </div>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Azure (Inherited)</h2>
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-600)]">
          {(responsibility?.azureInherited?.length ? responsibility.azureInherited : ["—"]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">MacTech Provides</h2>
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-600)]">
          {(responsibility?.mactechProvided?.length ? responsibility.mactechProvided : ["—"]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Customer Must Do</h2>
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-600)]">
          {(responsibility?.customerRequired?.length ? responsibility.customerRequired : ["—"]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      {(responsibility?.notes?.length ?? 0) > 0 && (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Notes</h2>
          <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-600)]">
            {responsibility!.notes.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Technical evidence status</h2>
        {technicalStatus.kind === "azure_inherited" && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">N/A — {technicalStatus.note}</p>
        )}
        {technicalStatus.kind === "no_run" && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">{technicalStatus.note}</p>
        )}
        {technicalStatus.kind === "result" && (
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  technicalStatus.status === "pass"
                    ? "bg-green-100 text-green-800"
                    : technicalStatus.status === "fail"
                      ? "bg-red-100 text-red-800"
                      : technicalStatus.status === "warn"
                        ? "bg-amber-100 text-amber-800"
                        : technicalStatus.status === "na"
                          ? "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                          : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                }`}
              >
                {technicalStatus.status}
              </span>
              <span className="text-[var(--color-gray-500)]">Run: {technicalStatus.runId}</span>
            </div>
            {technicalStatus.result?.title && (
              <p className="text-[var(--color-gray-700)]">{technicalStatus.result.title}</p>
            )}
            {technicalStatus.result?.observed && (
              <p className="text-[var(--color-gray-600)]"><strong>Observed:</strong> {String(technicalStatus.result.observed).slice(0, 300)}</p>
            )}
            {technicalStatus.result?.remediation && (
              <p className="text-[var(--color-gray-600)]"><strong>Remediation:</strong> {String(technicalStatus.result.remediation).slice(0, 300)}</p>
            )}
            <Link
              href={`/dashboard/evidence-engine/registers/technical_compliance_run${baseQuery}`}
              className="inline-block text-[var(--color-blue-accent)] hover:underline"
            >
              View technical runs
            </Link>
          </div>
        )}
      </section>

      {controlId === "3.11.2" && vulnStats && <ScanCadenceFreshness stats={vulnStats} />}
      {controlId === "3.11.3" && vulnStats && <TimeToRemediate stats={vulnStats} />}

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Mapped registers & evidence</h2>
        {registers.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No registers mapped.</p>
        ) : (
          <table className="mt-2 min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pb-2 font-medium text-[var(--color-gray-700)]">Register</th>
                <th className="pb-2 font-medium text-[var(--color-gray-700)]">Status</th>
                <th className="pb-2 font-medium text-[var(--color-gray-700)]">Last evidence</th>
                <th className="pb-2 font-medium text-[var(--color-gray-700)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {registers.map((rk) => {
                const stats = statsByRegister.get(rk);
                const health = stats?.registerHealth ?? "overdue";
                const name = registerNameById.get(rk) ?? rk;
                return (
                  <tr key={rk} className="border-b border-[var(--color-border-muted)]">
                    <td className="py-2 font-medium text-[var(--color-gray-900)]">{name}</td>
                    <td className="py-2">
                      <span
                        title={stats?.registerHealthReason}
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          health === "healthy"
                            ? "bg-green-100 text-green-800"
                            : health === "due"
                              ? "bg-amber-100 text-amber-800"
                              : health === "event_driven"
                                ? "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                                : "bg-red-100 text-red-800"
                        }`}
                      >
                        {health === "healthy" ? "Healthy" : health === "due" ? "Due soon" : health === "event_driven" ? "Event-driven" : "Overdue"}
                      </span>
                    </td>
                    <td className="py-2 text-[var(--color-gray-600)]">
                      {stats?.lastEntryAt ? (
                        <>
                          {stats.lastEntryAt.toLocaleDateString()}
                          {stats.lastEvidenceType !== "none" && (
                            <span className="ml-1 text-xs">
                              ({stats.lastEvidenceType === "final" ? "Final" : stats.lastEvidenceType === "draft" ? "Draft" : "Void"})
                            </span>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/dashboard/evidence-engine/registers/${encodeURIComponent(rk)}${baseQuery}`}
                        className="text-[var(--color-blue-accent)] hover:underline"
                      >
                        View / Add entry
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function formatResponsibility(model: string): string {
  const labels: Record<string, string> = {
    azure_inherited: "Azure inherited",
    mactech_provided: "MacTech provided",
    customer_managed: "Customer",
    shared: "Shared",
  };
  return labels[model] ?? model;
}

function ScanCadenceFreshness({ stats }: { stats: VulnStats }) {
  const a = stats.scanAttestation;
  const tone =
    a.status === "current"
      ? { wrap: "border-green-200 bg-green-50", pill: "bg-green-100 text-green-800", icon: "✓", title: "Scan cadence current" }
      : a.status === "stale"
        ? { wrap: "border-amber-200 bg-amber-50", pill: "bg-amber-100 text-amber-800", icon: "⚠", title: "Scan cadence stale" }
        : { wrap: "border-red-200 bg-red-50", pill: "bg-red-100 text-red-800", icon: "✕", title: "Scan attestation missing" };
  return (
    <section className={`rounded-[var(--radius-lg)] border ${tone.wrap} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">
            MDVM scan cadence
          </h2>
          <p className="mt-1 text-xs text-[var(--color-gray-600)]">
            EnclaveWatch writes a <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">MDVM-SCAN-ATTESTATION-YYYYMM</code>
            {" "}row to the vuln_remediation register monthly. After the 5th of each
            month, the prior month's row must be present.
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone.pill}`}>
          <span aria-hidden>{tone.icon}</span> {tone.title}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded border border-[var(--color-border-muted)] bg-white px-2 py-1.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Latest period</dt>
          <dd className="mt-0.5 font-mono text-sm text-[var(--color-navy-primary)]">{a.latestPeriod ?? "—"}</dd>
        </div>
        <div className="rounded border border-[var(--color-border-muted)] bg-white px-2 py-1.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Expected period</dt>
          <dd className="mt-0.5 font-mono text-sm text-[var(--color-navy-primary)]">{a.expectedPeriod}</dd>
        </div>
        <div className="rounded border border-[var(--color-border-muted)] bg-white px-2 py-1.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Total attestation rows</dt>
          <dd className="mt-0.5 font-mono text-sm text-[var(--color-navy-primary)]">{a.totalAttestationRows}</dd>
        </div>
      </dl>
    </section>
  );
}

function TimeToRemediate({ stats }: { stats: VulnStats }) {
  const hasAnyResolved = stats.ttrBySeverity.some((s) => s.resolvedCount > 0);
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Time-to-remediate</h2>
          <p className="mt-1 text-xs text-[var(--color-gray-600)]">
            Distance between <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">first_detected_utc</code>
            {" "}and <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">fixed_utc</code> per
            EnclaveWatch lifecycle-tracked finding. Color-coded against org SLA.
          </p>
        </div>
        {stats.regressionCount > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            title={stats.latestRegressionAt ? `Latest regression: ${stats.latestRegressionAt}` : undefined}
          >
            ↺ {stats.regressionCount} regression{stats.regressionCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!hasAnyResolved ? (
        <p className="mt-3 text-xs italic text-[var(--color-gray-500)]">
          No resolved findings yet — TTR distribution is empty. Once EnclaveWatch
          confirms a fix on a CVE, the row will populate here.
        </p>
      ) : (
        <table className="mt-3 min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border-muted)] text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
              <th className="py-1 font-semibold">Severity</th>
              <th className="py-1 font-semibold text-right">Resolved</th>
              <th className="py-1 font-semibold text-right">Median (d)</th>
              <th className="py-1 font-semibold text-right">P95 (d)</th>
              <th className="py-1 font-semibold text-right">SLA target</th>
              <th className="py-1 font-semibold text-right">Breaches</th>
            </tr>
          </thead>
          <tbody>
            {stats.ttrBySeverity.map((s) => {
              const medBreach = s.medianDays !== null ? ttrBreachLevel(s.severity, s.medianDays) : "ok";
              const p95Breach = s.p95Days !== null ? ttrBreachLevel(s.severity, s.p95Days) : "ok";
              return (
                <tr key={s.severity} className="border-b border-[var(--color-border-muted)]">
                  <td className="py-1.5 font-medium capitalize text-[var(--color-navy-primary)]">{s.severity}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--color-gray-700)]">{s.resolvedCount}</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${ttrTone(medBreach)}`}>
                    {s.medianDays === null ? "—" : s.medianDays.toFixed(1)}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${ttrTone(p95Breach)}`}>
                    {s.p95Days === null ? "—" : s.p95Days.toFixed(1)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--color-gray-500)]">{s.slaDays}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${s.slaBreachCount > 0 ? "text-red-700" : "text-[var(--color-gray-500)]"}`}>
                    {s.slaBreachCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-[10px] italic text-[var(--color-gray-500)]">
        SLA targets: critical 30d · high 90d · medium 180d · low 365d. Color
        thresholds: green ≤75% of SLA, amber 75–100%, red &gt; SLA.
      </p>
    </section>
  );
}

function ttrTone(level: "ok" | "approaching" | "breach"): string {
  if (level === "breach") return "text-red-700";
  if (level === "approaching") return "text-amber-700";
  return "text-[var(--color-gray-700)]";
}
