import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export default async function GovernanceRegistersPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  let list = await db
    .select()
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  if (list.length === 0) {
    const templates = await db
      .select()
      .from(governanceRegisters)
      .where(sql`${governanceRegisters.organizationId} IS NULL`);
    for (const t of templates) {
      await db.insert(governanceRegisters).values({
        organizationId: orgId,
        projectId: null,
        registerKey: t.registerKey,
        name: t.name,
        description: t.description,
        requiredColumns: t.requiredColumns,
        retainForDays: t.retainForDays,
      });
    }
    list = await db
      .select()
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));
  }

  const counts = await Promise.all(
    list.map(async (r) => {
      const [c] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, r.id));
      return { registerId: r.id, entryCount: c?.count ?? 0 };
    })
  );
  const lastEntry = await Promise.all(
    list.map(async (r) => {
      const [last] = await db
        .select({ createdAt: governanceRegisterEntries.createdAt })
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.registerId, r.id))
        .orderBy(desc(governanceRegisterEntries.createdAt))
        .limit(1);
      return { registerId: r.id, lastEntryAt: last?.createdAt ?? null };
    })
  );
  const countByReg = Object.fromEntries(counts.map((c) => [c.registerId, c.entryCount]));
  const lastByReg = Object.fromEntries(lastEntry.map((l) => [l.registerId, l.lastEntryAt]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Governance
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Registers</h2>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Access authorizations, training completion, incident log, and other registers. Create entries and export CSV.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Register</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Key</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Entries</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Last entry</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]">
                <td className="px-4 py-3 font-medium text-[var(--color-gray-900)]">{r.name}</td>
                <td className="px-4 py-3 font-mono text-[var(--color-gray-600)]">{r.registerKey}</td>
                <td className="px-4 py-3 text-[var(--color-gray-600)]">{countByReg[r.id] ?? 0}</td>
                <td className="px-4 py-3 text-[var(--color-gray-600)]">
                  {lastByReg[r.id] ? new Date(lastByReg[r.id]!).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/governance/registers/${encodeURIComponent(r.registerKey)}`}
                    className="font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    View / Add entry
                  </Link>
                  {" · "}
                  <a
                    href={`/api/governance/registers/${encodeURIComponent(r.registerKey)}/export`}
                    className="font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    Export CSV
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && (
        <p className="text-sm text-[var(--color-gray-500)]">
          No registers yet. Run the governance seed to create the 16 standard registers.
        </p>
      )}
    </div>
  );
}
