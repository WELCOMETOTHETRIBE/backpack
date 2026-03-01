import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function GovernanceRegistersPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const cookie = (await headers()).get("cookie") ?? "";
  const res = await fetch(`${base}/api/governance/registers`, {
    cache: "no-store",
    headers: { cookie },
  });
  if (!res.ok) redirect("/auth/signin");
  const { items: list } = (await res.json()) as {
    items: Array<{
      id: string;
      registerKey: string;
      name: string;
      entryCount: number;
      lastEntryAt: string | null;
    }>;
  };

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
                <td className="px-4 py-3 text-[var(--color-gray-600)]">{r.entryCount ?? 0}</td>
                <td className="px-4 py-3 text-[var(--color-gray-600)]">
                  {r.lastEntryAt ? new Date(r.lastEntryAt).toLocaleDateString() : "—"}
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
          No registers available. Ensure you are signed in and have an organization assigned.
        </p>
      )}
    </div>
  );
}
