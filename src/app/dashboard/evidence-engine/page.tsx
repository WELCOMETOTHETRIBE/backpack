import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  ensureEvidenceEngineRegistersForOrg,
  getRegisterStatsForOrgAndBoundary,
} from "@/lib/evidence-engine/control-dashboard";
import { computeScoring, type ResponsibilityByControl } from "@/lib/evidence-engine/scoring";
import { getResponsibilitiesForOrg } from "@/lib/evidence-engine/responsibilities";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";
import {
  getTechnicalRunsForBoundary,
  getLatestTechnicalRunForBoundary,
} from "@/lib/evidence-engine/technical-runs";
import type { TechnicalResultsByControl } from "@/lib/evidence-engine/scoring";
import { getEvidenceMap } from "@/data/cmmc";
import { BoundarySelector } from "./BoundarySelector";

const RESPONSIBILITY_LABELS: Record<string, string> = {
  azure_inherited: "Azure inherited",
  mactech_provided: "MacTech provided",
  customer_managed: "Customer",
  shared: "Shared",
};

type PageProps = { searchParams: Promise<{ boundary?: string; overdue?: string; status?: string; responsibility?: string }> };

function buildBaseQuery(boundaryId: string | null, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (boundaryId) q.set("boundary", boundaryId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function EvidenceEngineDashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { boundary: boundaryParam, overdue, status: statusFilter, responsibility: responsibilityFilter } = await searchParams;
  const { effectiveBoundaryId, boundaries } = await resolveEffectiveBoundary(orgId, boundaryParam);

  if (boundaries.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Evidence Registers</h1>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <p className="text-sm text-[var(--color-gray-500)]">
          <Link href="/dashboard/boundary" className="text-[var(--color-blue-accent)] hover:underline">
            Open System Boundary
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Evidence Registers</h1>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <BoundarySelector boundaries={boundaries} currentBoundaryId={null} />
      </div>
    );
  }

  const onlyOverdue = overdue === "1";
  const filterStatus = statusFilter === "pass" || statusFilter === "partial" || statusFilter === "fail" ? statusFilter : null;
  const filterResponsibility =
    responsibilityFilter === "azure_inherited" || responsibilityFilter === "mactech_provided" || responsibilityFilter === "customer_managed" || responsibilityFilter === "shared"
      ? responsibilityFilter
      : null;

  await ensureEvidenceEngineRegistersForOrg(orgId);
  const [statsByRegister, responsibilitiesMap, technicalRuns, latestTechnicalRun] = await Promise.all([
    getRegisterStatsForOrgAndBoundary(orgId, effectiveBoundaryId),
    getResponsibilitiesForOrg(orgId, effectiveBoundaryId),
    getTechnicalRunsForBoundary(effectiveBoundaryId, 5),
    getLatestTechnicalRunForBoundary(effectiveBoundaryId),
  ]);
  const responsibilitiesByControl: ResponsibilityByControl = new Map();
  for (const [controlId, info] of responsibilitiesMap) {
    responsibilitiesByControl.set(controlId, { responsibilityModel: info.responsibilityModel });
  }
  const technicalResultsByControl: TechnicalResultsByControl = new Map();
  if (latestTechnicalRun?.controlResults && typeof latestTechnicalRun.controlResults === "object") {
    for (const [controlId, result] of Object.entries(latestTechnicalRun.controlResults)) {
      if (result && typeof result === "object" && "status" in result && typeof (result as { status: string }).status === "string") {
        technicalResultsByControl.set(controlId, { status: (result as { status: string }).status });
      }
    }
  }

  const evidenceMap = getEvidenceMap();
  const scoring = computeScoring(statsByRegister, {
    responsibilitiesByControl,
    technicalResultsByControl: technicalResultsByControl.size > 0 ? technicalResultsByControl : undefined,
  });
  let rows = scoring.controls;

  const q = (overdue?: string, status?: string, responsibility?: string) =>
    buildBaseQuery(effectiveBoundaryId, { ...(overdue && { overdue }), ...(status && { status }), ...(responsibility && { responsibility }) });
  if (filterStatus) rows = rows.filter((r) => r.controlStatus === filterStatus);
  if (filterResponsibility) rows = rows.filter((r) => r.responsibilityModel === filterResponsibility);
  if (onlyOverdue) {
    const overdueSet = new Set(
      [...statsByRegister.entries()]
        .filter(([, s]) => s.registerHealth === "overdue")
        .map(([k]) => k)
    );
    rows = rows.filter((r) => {
      const c = evidenceMap.controls.find((c) => c.control_id === r.controlId);
      const regs = c?.registers ?? [];
      return regs.some((rk) => overdueSet.has(rk));
    });
  }
  const registerNameById = new Map(evidenceMap.registers.map((r) => [r.id, r.name]));
  const userRole = (session?.user as { role?: string })?.role;
  const isAdmin = userRole === "Admin";
  const effectiveBoundaryName = boundaries.find((b) => b.id === effectiveBoundaryId)?.name ?? null;

  return (
    <div className="space-y-6">
      {/* Orientation banner */}
      <div className="rounded-[var(--radius-lg)] border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/20">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Evidence Registers — Operational Records</p>
        <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
          Advanced view: shows per-control evidence confidence and cadence health for a specific system boundary.
          For day-to-day register management,{" "}
          <a href="/dashboard/registers" className="font-semibold underline hover:no-underline">
            use Registers
          </a>. To upload OS evidence or governance bundles,{" "}
          <a href="/dashboard/documents" className="font-semibold underline hover:no-underline">
            use Documents
          </a>.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
            Evidence Registers
          </h1>
          {effectiveBoundaryName && (
            <p className="mt-0.5 text-sm font-medium text-[var(--color-gray-700)]">
              Boundary: {effectiveBoundaryName}
            </p>
          )}
          <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
            Operational evidence for all 110 NIST SP 800-171 controls. Readiness is automated from
            finalized register entries and cadence; do not interpret as &quot;compliant&quot;.
          </p>
          <p className="mt-1 text-xs text-[var(--color-gray-500)]">
            Readiness (automated): {scoring.overallReadinessExcludingNa}% pass (excluding N/A) · {scoring.overallReadiness}% overall
          </p>
          {isAdmin && (
            <p className="mt-1 text-xs text-[var(--color-amber-700)]">
              Export may contain sensitive data. Only include non-CUI or explicitly exportable items.
            </p>
          )}
        </div>
        <BoundarySelector boundaries={boundaries} currentBoundaryId={effectiveBoundaryId} />
      </div>
      <div>
        {technicalRuns.length > 0 && (
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">Technical runs</h2>
            <p className="mt-1 text-xs text-[var(--color-gray-600)]">Latest collector runs for this boundary.</p>
            <ul className="mt-2 space-y-1 text-sm">
              {technicalRuns.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/evidence-engine/entries/${run.id}${buildBaseQuery(effectiveBoundaryId)}`}
                    className="font-mono text-[var(--color-gray-700)] hover:text-[var(--color-blue-accent)] hover:underline"
                  >
                    {run.runId}
                  </Link>
                  <span className="text-[var(--color-gray-500)]">{run.createdAt.toLocaleDateString()}</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      run.overallStatus === "pass"
                        ? "bg-green-100 text-green-800"
                        : run.overallStatus === "fail"
                          ? "bg-red-100 text-red-800"
                          : run.overallStatus === "warn"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                    }`}
                  >
                    {run.overallStatus}
                  </span>
                  <span className="text-[var(--color-gray-500)]">
                    {run.pass} pass, {run.fail} fail, {run.warn} warn
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href={`/dashboard/evidence-engine/registers/technical_compliance_run${buildBaseQuery(effectiveBoundaryId)}`}
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View all technical runs
            </Link>
          </section>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Link
            href={`/dashboard/evidence-engine/registers${buildBaseQuery(effectiveBoundaryId)}`}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            View registers
          </Link>
          <Link
            href={`/dashboard/evidence-engine/registers${buildBaseQuery(effectiveBoundaryId, { auditor: "1" })}`}
            className="text-sm font-medium text-[var(--color-gray-600)] hover:underline"
          >
            View registers (auditor)
          </Link>
          <a
            href={`/api/evidence-engine/ssp?download=1&boundary_id=${encodeURIComponent(effectiveBoundaryId)}`}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            download
          >
            Generate SSP Draft (MDX)
          </a>
          {isAdmin && (
            <>
              <a
                href={`/api/evidence-engine/export/auditor-bundle?boundary_id=${encodeURIComponent(effectiveBoundaryId)}`}
                className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                download
              >
                Export Auditor Bundle (ZIP)
              </a>
            </>
          )}
          {onlyOverdue ? (
            <Link
              href={`/dashboard/evidence-engine${q(undefined, filterStatus ?? undefined)}`}
              className="text-sm font-medium text-[var(--color-gray-600)] hover:underline"
            >
              Show all controls
            </Link>
          ) : (
            <Link
              href={`/dashboard/evidence-engine${q("1", filterStatus ?? undefined)}`}
              className="text-sm font-medium text-[var(--color-amber-700)] hover:underline"
            >
              Only overdue controls
            </Link>
          )}
          <span className="text-[var(--color-gray-400)]">|</span>
          <span className="text-xs text-[var(--color-gray-600)]">Filter by status:</span>
          {filterStatus ? (
            <Link href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined)}`} className="text-sm font-medium text-[var(--color-gray-600)] hover:underline">
              All
            </Link>
          ) : (
            <span className="text-sm text-[var(--color-gray-400)]">All</span>
          )}
          <Link href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined, "pass")}`} className="text-sm font-medium text-[var(--color-green-800)] hover:underline">Pass</Link>
          <Link href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined, "partial")}`} className="text-sm font-medium text-[var(--color-amber-700)] hover:underline">Partial</Link>
          <Link href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined, "fail")}`} className="text-sm font-medium text-[var(--color-red-700)] hover:underline">Fail</Link>
          <span className="text-[var(--color-gray-400)]">|</span>
          <span className="text-xs text-[var(--color-gray-600)]">Responsibility:</span>
          {["azure_inherited", "mactech_provided", "customer_managed", "shared"].map((rm) => (
            <Link
              key={rm}
              href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined, filterStatus ?? undefined, rm)}`}
              className={`text-sm font-medium ${filterResponsibility === rm ? "text-[var(--color-gray-900)]" : "text-[var(--color-blue-accent)] hover:underline"}`}
            >
              {RESPONSIBILITY_LABELS[rm]}
            </Link>
          ))}
          {filterResponsibility && (
            <Link
              href={`/dashboard/evidence-engine${q(onlyOverdue ? "1" : undefined, filterStatus ?? undefined)}`}
              className="text-sm font-medium text-[var(--color-gray-600)] hover:underline"
            >
              All
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Control ID
              </th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Family</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Responsibility</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Mapped Registers
              </th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Operational Evidence Status
              </th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Evidence Confidence
              </th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Last Evidence
              </th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">
                Next Due
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const regs = row.controlId ? (evidenceMap.controls.find((c) => c.control_id === row.controlId)?.registers ?? []) : [];
              return (
                <tr
                  key={row.controlId}
                  className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-gray-900)]">
                    <Link href={`/dashboard/evidence-engine/controls/${encodeURIComponent(row.controlId)}${buildBaseQuery(effectiveBoundaryId)}`} className="text-[var(--color-blue-accent)] hover:underline">
                      {row.controlId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-700)]">{row.family}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.responsibilityModel === "azure_inherited"
                          ? "bg-sky-100 text-sky-800"
                          : row.responsibilityModel === "mactech_provided"
                            ? "bg-violet-100 text-violet-800"
                            : row.responsibilityModel === "customer_managed"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                      }`}
                    >
                      {row.responsibilityModel ? RESPONSIBILITY_LABELS[row.responsibilityModel] ?? row.responsibilityModel : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {regs.length === 0 ? "—" : regs.map((rk) => registerNameById.get(rk) ?? rk).join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.controlStatus === "pass"
                          ? "bg-green-100 text-green-800"
                          : row.controlStatus === "partial"
                            ? "bg-amber-100 text-amber-800"
                            : row.controlStatus === "fail"
                              ? "bg-red-100 text-red-800"
                              : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)]"
                      }`}
                    >
                      {row.controlStatus === "pass" ? "Pass" : row.controlStatus === "partial" ? "Partial" : row.controlStatus === "fail" ? "Fail" : "N/A"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {row.confidencePercent}%
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {row.lastEvidenceDate ? (
                      <>
                        {row.lastEvidenceDate.toLocaleDateString()}
                        {row.lastEvidenceType !== "none" && (
                          <span
                            className={`ml-1.5 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                              row.lastEvidenceType === "final"
                                ? "bg-green-100 text-green-800"
                                : row.lastEvidenceType === "draft"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-[var(--color-gray-200)] text-[var(--color-gray-700)]"
                            }`}
                          >
                            {row.lastEvidenceType === "final" ? "Final" : row.lastEvidenceType === "draft" ? "Draft" : "Void"}
                          </span>
                        )}
                      </>
                    ) : (
                      row.lastEvidenceType !== "none" ? (
                        <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--color-gray-200)] text-[var(--color-gray-700)]">
                          {row.lastEvidenceType === "draft" ? "Draft" : row.lastEvidenceType === "void" ? "Void" : "—"}
                        </span>
                      ) : "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {row.nextDueDate ? row.nextDueDate.toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
