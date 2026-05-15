import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { auth } from "@/lib/auth";

export const metadata = { title: "CUI Intake | Trust Codex" };

export default async function IntakeDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  if (!user?.organizationId) redirect("/auth/signin");

  const requests = await db
    .select()
    .from(intakeRequests)
    .where(eq(intakeRequests.organizationId, user.organizationId))
    .orderBy(desc(intakeRequests.createdAt))
    .limit(200);

  const fileCounts = await Promise.all(
    requests.map(async (request) => {
      const rows = await db
        .select({ id: intakeFiles.id })
        .from(intakeFiles)
        .where(and(eq(intakeFiles.intakeRequestId, request.id)))
        .limit(500);
      return [request.id, rows.length] as const;
    }),
  );
  const fileCountByRequestId = new Map(fileCounts);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-navy-primary)]">
            CUI/FCI Intake Registry
          </h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Metadata-only controlled intake lifecycle for C3PAO-defensible chain of custody.
          </p>
        </div>
        <Link
          href="/dashboard/intake/new"
          className="rounded-md bg-[var(--color-blue-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create Intake Request
        </Link>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Transaction ID</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Title</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Classification</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Status</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Files</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Created</th>
              <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr
                key={request.id}
                className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]"
              >
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-gray-700)]">
                  {request.intakeTransactionId}
                </td>
                <td className="px-4 py-3 text-[var(--color-gray-900)]">{request.title}</td>
                <td className="px-4 py-3 text-[var(--color-gray-700)]">
                  {request.expectedClassification}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-700)]">
                    {request.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--color-gray-700)]">
                  {fileCountByRequestId.get(request.id) ?? 0}
                </td>
                <td className="px-4 py-3 text-[var(--color-gray-700)]">
                  {new Date(request.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/intake/${encodeURIComponent(request.id)}`}
                    className="font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--color-gray-600)]">
                  No intake requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
