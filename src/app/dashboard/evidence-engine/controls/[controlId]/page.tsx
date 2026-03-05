import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEvidenceMap } from "@/data/cmmc";
import { getRegisterStatsForOrg } from "@/lib/evidence-engine/control-dashboard";
import { getResponsibilityForControl } from "@/lib/evidence-engine/responsibilities";

type PageProps = { params: Promise<{ controlId: string }> };

export default async function EvidenceEngineControlDetailPage({ params }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { controlId } = await params;
  const evidenceMap = getEvidenceMap();
  const controlMeta = evidenceMap.controls.find((c) => c.control_id === controlId);
  if (!controlMeta) notFound();

  const [responsibility, statsByRegister] = await Promise.all([
    getResponsibilityForControl(orgId, controlId),
    getRegisterStatsForOrg(orgId),
  ]);

  const registers = controlMeta.registers ?? [];
  const registerNameById = new Map(evidenceMap.registers.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/evidence-engine"
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
                        href={`/dashboard/evidence-engine/registers/${encodeURIComponent(rk)}`}
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
