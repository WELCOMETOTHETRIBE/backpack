import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEvidenceMap } from "@/data/cmmc";
import { getRegisterStatsForOrgAndBoundary } from "@/lib/evidence-engine/control-dashboard";
import { getResponsibilityForControl } from "@/lib/evidence-engine/responsibilities";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";
import { getCombinedTechnicalStatus } from "@/lib/evidence-engine/technical-runs";
import { BoundarySelector } from "../../BoundarySelector";

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

  if (boundaries.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine" className="text-sm text-[var(--color-gray-600)] hover:underline">← Evidence Engine</Link>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Control {controlId}</h1>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <Link href="/dashboard/os-baselines" className="text-sm text-[var(--color-blue-accent)] hover:underline">Create a boundary in System Boundary</Link>
      </div>
    );
  }

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine" className="text-sm text-[var(--color-gray-600)] hover:underline">← Evidence Engine</Link>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Control {controlId}</h1>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <BoundarySelector boundaries={boundaries} currentBoundaryId={null} />
      </div>
    );
  }

  const [responsibility, statsByRegister] = await Promise.all([
    getResponsibilityForControl(orgId, controlId, effectiveBoundaryId),
    getRegisterStatsForOrgAndBoundary(orgId, effectiveBoundaryId),
  ]);
  const technicalStatus = await getCombinedTechnicalStatus(
    effectiveBoundaryId,
    controlId,
    responsibility?.responsibilityModel ?? null
  );

  const registers = controlMeta.registers ?? [];
  const registerNameById = new Map(evidenceMap.registers.map((r) => [r.id, r.name]));
  const baseQuery = buildBaseQuery(effectiveBoundaryId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          {controlMeta.family} · Responsibility: {responsibility?.responsibilityModel ? formatResponsibility(responsibility.responsibilityModel) : "—"}
        </p>
        </div>
        <BoundarySelector boundaries={boundaries} currentBoundaryId={effectiveBoundaryId} />
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
