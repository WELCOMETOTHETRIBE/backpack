import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { getEvidenceMap } from "@/data/cmmc";
import { ensureEvidenceEngineRegistersForOrg, getRegisterStatsForOrgAndBoundary } from "@/lib/evidence-engine/control-dashboard";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";

type PageProps = { searchParams: Promise<{ boundary?: string; auditor?: string }> };

function buildBaseQuery(boundaryId: string | null, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (boundaryId) q.set("boundary", boundaryId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function EvidenceEngineRegistersPage({ searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { boundary: boundaryParam } = await searchParams;
  const { effectiveBoundaryId, boundaries } = await resolveEffectiveBoundary(orgId, boundaryParam);

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine" className="text-sm text-[var(--color-gray-600)] hover:underline">← Evidence Engine</Link>
        <h2 className="text-xl font-semibold text-[var(--color-navy-primary)]">Registers</h2>
        <p className="text-[var(--color-gray-600)]">No system boundary is configured for this organization.</p>
        <p className="text-sm">
          <Link href="/dashboard/boundary" className="text-[var(--color-blue-accent)] hover:underline">Open System Boundary</Link> to get started.
        </p>
      </div>
    );
  }

  await ensureEvidenceEngineRegistersForOrg(orgId);
  const evidenceMap = getEvidenceMap();
  const registerStats = await getRegisterStatsForOrgAndBoundary(orgId, effectiveBoundaryId);

  const orgRegs = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
      name: governanceRegisters.name,
    })
    .from(governanceRegisters)
    .where(
      or(
        eq(governanceRegisters.organizationId, orgId),
        isNull(governanceRegisters.organizationId)
      )
    );

  const aggregated = await db
    .select({
      registerId: governanceRegisterEntries.registerId,
      count: sql<number>`count(*)::int`.as("count"),
      lastAt: sql<Date | null>`max(${governanceRegisterEntries.createdAt})`.as("last_at"),
    })
    .from(governanceRegisterEntries)
    .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
    .where(
      and(
        or(
          eq(governanceRegisters.organizationId, orgId),
          isNull(governanceRegisters.organizationId)
        ),
        eq(governanceRegisterEntries.boundaryId, effectiveBoundaryId)
      )
    )
    .groupBy(governanceRegisterEntries.registerId);

  const idToKey = new Map(orgRegs.map((r) => [r.id, r.registerKey]));
  const countByKey: Record<string, number> = {};
  const lastByKey: Record<string, Date | null> = {};
  for (const row of aggregated) {
    const key = idToKey.get(row.registerId);
    if (key !== undefined) {
      countByKey[key] = row.count ?? 0;
      lastByKey[key] = row.lastAt ?? null;
    }
  }

  const { auditor } = await searchParams;
  const baseQuery = buildBaseQuery(effectiveBoundaryId, auditor === "1" ? { auditor: "1" } : {});
  const effectiveBoundaryName = boundaries.find((b) => b.id === effectiveBoundaryId)?.name ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/evidence-engine${buildBaseQuery(effectiveBoundaryId)}`}
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Evidence Engine
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          Registers
        </h2>
        {effectiveBoundaryName && (
          <p className="mt-0.5 text-sm font-medium text-[var(--color-gray-700)]">
            Boundary: {effectiveBoundaryName}
          </p>
        )}
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Create and view entries for each register. Entries provide operational evidence for
          controls.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Register</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Cadence</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Entries</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Last entry</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Next due</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Status</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {evidenceMap.registers.map((reg) => {
              const stats = registerStats.get(reg.id);
              const nextDueAt = stats?.nextDueAt ?? null;
              const health = stats?.registerHealth ?? "overdue";
              return (
                <tr
                  key={reg.id}
                  className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-gray-900)]">
                    {reg.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">{reg.cadence_hint}</td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {countByKey[reg.id] ?? 0}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {lastByKey[reg.id] != null
                      ? new Date(lastByKey[reg.id]!).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-gray-600)]">
                    {nextDueAt ? nextDueAt.toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={stats?.registerHealthReason}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
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
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/evidence-engine/registers/${encodeURIComponent(reg.id)}${baseQuery}`}
                      className="font-medium text-[var(--color-blue-accent)] hover:underline"
                    >
                      View / Add entry
                    </Link>
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
