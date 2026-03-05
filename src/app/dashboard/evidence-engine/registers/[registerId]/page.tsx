import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { AuditorToggle } from "./AuditorToggle";
import { CreateEntryLink } from "./CreateEntryLink";

type PageProps = { params: Promise<{ registerId: string }>; searchParams: Promise<{ auditor?: string }> };

export default async function EvidenceEngineRegisterEntriesPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { registerId: registerKey } = await params;
  const { auditor } = await searchParams;
  const auditorOnly = auditor === "1";
  const userRole = (session?.user as { role?: string })?.role;
  const canCreate = userRole === "Admin" || userRole === "Compliance";

  const [register] = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisters.registerKey, registerKey)
      )
    );

  if (!register) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Registers
        </Link>
        <p className="text-sm text-red-600">Register not found.</p>
      </div>
    );
  }

  const conditions = [eq(governanceRegisterEntries.registerId, register.id)];
  if (auditorOnly) {
    conditions.push(eq(governanceRegisterEntries.status, "final"));
  }

  const entries = await db
    .select()
    .from(governanceRegisterEntries)
    .where(and(...conditions))
    .orderBy(desc(governanceRegisterEntries.createdAt))
    .limit(100);

  const entriesWithSummary = entries.map((e) => {
    const data = (e.entryData ?? {}) as Record<string, unknown>;
    const entryType = e.entryType ?? "unknown";
    const template = getSummaryTemplate(registerKey, entryType);
    const summary = template
      ? renderSummary(template, data)
      : getFallbackSummary(entryType, data);
    return {
      id: e.id,
      summary,
      status: e.status,
      entryType: e.entryType,
      finalizedAt: e.finalizedAt,
      createdAt: e.createdAt,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/evidence-engine/registers"
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Registers
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          {register.name}
        </h2>
        <p className="mt-0.5 font-mono text-sm text-[var(--color-gray-600)]">
          {register.registerKey}
        </p>
        {register.description && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">{register.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <AuditorToggle registerKey={registerKey} auditorOnly={auditorOnly} />
          {canCreate && <CreateEntryLink registerKey={registerKey} />}
          <a
            href={`/api/governance/registers/${encodeURIComponent(registerKey)}/export`}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Entries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Summary</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Type</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Status</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Finalized</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Created</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entriesWithSummary.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-border-muted)]">
                  <td className="py-2 text-[var(--color-gray-800)] max-w-md truncate" title={e.summary}>
                    {e.summary}
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">{e.entryType ?? "—"}</td>
                  <td className="py-2">
                    <span
                      className={
                        e.status === "final"
                          ? "text-green-700 font-medium"
                          : "text-[var(--color-gray-600)]"
                      }
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">
                    {e.finalizedAt ? new Date(e.finalizedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/dashboard/evidence-engine/entries/${e.id}`}
                      className="font-medium text-[var(--color-blue-accent)] hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entriesWithSummary.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            {auditorOnly ? "No finalized entries." : "No entries yet."}
          </p>
        )}
      </div>
    </div>
  );
}
