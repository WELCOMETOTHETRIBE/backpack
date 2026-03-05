import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  ensureEvidenceEngineRegistersForOrg,
  getRegisterStatsForOrg,
} from "@/lib/evidence-engine/control-dashboard";
import { computeScoring, type ResponsibilityByControl } from "@/lib/evidence-engine/scoring";
import { getResponsibilitiesForOrg } from "@/lib/evidence-engine/responsibilities";
import { getEvidenceMap } from "@/data/cmmc";

const RESPONSIBILITY_LABELS: Record<string, string> = {
  azure_inherited: "Azure inherited",
  mactech_provided: "MacTech provided",
  customer_managed: "Customer",
  shared: "Shared",
};

type PageProps = { searchParams: Promise<{ overdue?: string; status?: string; responsibility?: string }> };

export default async function EvidenceEngineDashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { overdue, status: statusFilter, responsibility: responsibilityFilter } = await searchParams;
  const onlyOverdue = overdue === "1";
  const filterStatus = statusFilter === "pass" || statusFilter === "partial" || statusFilter === "fail" ? statusFilter : null;
  const filterResponsibility =
    responsibilityFilter === "azure_inherited" || responsibilityFilter === "mactech_provided" || responsibilityFilter === "customer_managed" || responsibilityFilter === "shared"
      ? responsibilityFilter
      : null;

  await ensureEvidenceEngineRegistersForOrg(orgId);
  const statsByRegister = await getRegisterStatsForOrg(orgId);
  const responsibilitiesMap = await getResponsibilitiesForOrg(orgId);
  const responsibilitiesByControl: ResponsibilityByControl = new Map();
  for (const [controlId, info] of responsibilitiesMap) {
    responsibilitiesByControl.set(controlId, { responsibilityModel: info.responsibilityModel });
  }

  const evidenceMap = getEvidenceMap();
  const scoring = computeScoring(statsByRegister, { responsibilitiesByControl });
  let rows = scoring.controls;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
          Evidence Engine
        </h1>
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
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Link
            href="/dashboard/evidence-engine/registers"
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            View registers
          </Link>
          <Link
            href="/dashboard/evidence-engine/registers?auditor=1"
            className="text-sm font-medium text-[var(--color-gray-600)] hover:underline"
          >
            View registers (auditor)
          </Link>
          <a
            href="/api/evidence-engine/ssp?download=1"
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            download
          >
            Generate SSP Draft (MDX)
          </a>
          {isAdmin && (
            <>
              <a
                href="/api/evidence-engine/export/auditor-bundle"
                className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                download
              >
                Export Auditor Bundle (ZIP)
              </a>
            </>
          )}
          {onlyOverdue ? (
            <Link
              href={filterStatus ? `/dashboard/evidence-engine?status=${filterStatus}` : "/dashboard/evidence-engine"}
              className="text-sm font-medium text-[var(--color-gray-600)] hover:underline"
            >
              Show all controls
            </Link>
          ) : (
            <Link
              href={filterStatus ? `/dashboard/evidence-engine?overdue=1&status=${filterStatus}` : "/dashboard/evidence-engine?overdue=1"}
              className="text-sm font-medium text-[var(--color-amber-700)] hover:underline"
            >
              Only overdue controls
            </Link>
          )}
          <span className="text-[var(--color-gray-400)]">|</span>
          <span className="text-xs text-[var(--color-gray-600)]">Filter by status:</span>
          {filterStatus ? (
            <Link href={onlyOverdue ? "/dashboard/evidence-engine?overdue=1" : "/dashboard/evidence-engine"} className="text-sm font-medium text-[var(--color-gray-600)] hover:underline">
              All
            </Link>
          ) : (
            <span className="text-sm text-[var(--color-gray-400)]">All</span>
          )}
          <Link href={onlyOverdue ? "/dashboard/evidence-engine?overdue=1&status=pass" : "/dashboard/evidence-engine?status=pass"} className="text-sm font-medium text-[var(--color-green-800)] hover:underline">Pass</Link>
          <Link href={onlyOverdue ? "/dashboard/evidence-engine?overdue=1&status=partial" : "/dashboard/evidence-engine?status=partial"} className="text-sm font-medium text-[var(--color-amber-700)] hover:underline">Partial</Link>
          <Link href={onlyOverdue ? "/dashboard/evidence-engine?overdue=1&status=fail" : "/dashboard/evidence-engine?status=fail"} className="text-sm font-medium text-[var(--color-red-700)] hover:underline">Fail</Link>
          <span className="text-[var(--color-gray-400)]">|</span>
          <span className="text-xs text-[var(--color-gray-600)]">Responsibility:</span>
          {["azure_inherited", "mactech_provided", "customer_managed", "shared"].map((rm) => (
            <Link
              key={rm}
              href={
                onlyOverdue
                  ? `/dashboard/evidence-engine?overdue=1&responsibility=${rm}${filterStatus ? `&status=${filterStatus}` : ""}`
                  : `/dashboard/evidence-engine?responsibility=${rm}${filterStatus ? `&status=${filterStatus}` : ""}`
              }
              className={`text-sm font-medium ${filterResponsibility === rm ? "text-[var(--color-gray-900)]" : "text-[var(--color-blue-accent)] hover:underline"}`}
            >
              {RESPONSIBILITY_LABELS[rm]}
            </Link>
          ))}
          {filterResponsibility && (
            <Link
              href={onlyOverdue ? `/dashboard/evidence-engine?overdue=1${filterStatus ? `&status=${filterStatus}` : ""}` : filterStatus ? `/dashboard/evidence-engine?status=${filterStatus}` : "/dashboard/evidence-engine"}
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
                    <Link href={`/dashboard/evidence-engine/controls/${encodeURIComponent(row.controlId)}`} className="text-[var(--color-blue-accent)] hover:underline">
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
