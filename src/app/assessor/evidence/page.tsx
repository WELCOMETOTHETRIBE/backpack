import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { controlEvidenceLinks, controlRecords, controls } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { EvidenceExportButton, type EvidenceRow } from "./EvidenceExportButton";

function evidenceStatus(expiresAt: Date | null): { label: string; cls: string } {
  if (!expiresAt) return { label: "No expiry", cls: "text-[var(--color-gray-400)]" };
  const now = Date.now();
  const exp = expiresAt.getTime();
  if (exp < now) return { label: "Expired", cls: "text-red-600 font-semibold" };
  if (exp - now < 30 * 86_400_000) return { label: "Expiring soon", cls: "text-amber-600 font-semibold" };
  return { label: "Valid", cls: "text-emerald-600" };
}

export default async function AssessorEvidencePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") redirect("/auth/signin");

  const rows = await db
    .select({
      id: controlEvidenceLinks.id,
      runId: controlEvidenceLinks.runId,
      filePath: controlEvidenceLinks.filePath,
      sha256Hash: controlEvidenceLinks.sha256Hash,
      description: controlEvidenceLinks.description,
      source: controlEvidenceLinks.source,
      linkedAt: controlEvidenceLinks.linkedAt,
      expiresAt: controlEvidenceLinks.expiresAt,
      controlId: controlRecords.controlId,
      controlTitle: controls.title,
    })
    .from(controlEvidenceLinks)
    .leftJoin(controlRecords, eq(controlEvidenceLinks.controlRecordId, controlRecords.id))
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(eq(controlEvidenceLinks.organizationId, orgId))
    .orderBy(asc(controlEvidenceLinks.expiresAt));

  const now = Date.now();
  const expiredCount = rows.filter((r) => r.expiresAt && r.expiresAt.getTime() < now).length;
  const expiringSoonCount = rows.filter(
    (r) => r.expiresAt && r.expiresAt.getTime() > now && r.expiresAt.getTime() - now < 30 * 86_400_000
  ).length;
  const inheritedCount = rows.filter((r) => r.runId.startsWith("INHERITED-")).length;

  // Build CSV export rows
  const exportRows: EvidenceRow[] = rows.map((r) => ({
    controlId: r.controlId ?? "",
    controlTitle: r.controlTitle ?? "",
    runId: r.runId,
    filePath: r.filePath,
    sha256Hash: r.sha256Hash,
    source: r.source ?? "",
    linkedAt: r.linkedAt ? r.linkedAt.toISOString() : "",
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : "",
    status: evidenceStatus(r.expiresAt).label,
  }));

  const cardClass = "rounded-xl border border-[var(--color-border)] bg-white shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">Evidence Index</h1>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              All enclave evidence metadata links — sorted by expiration date, soonest first.
            </p>
          </div>
          <EvidenceExportButton rows={exportRows} />
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Total Entries</p>
            <p className="mt-1 text-2xl font-bold text-[var(--color-navy-primary)]">{rows.length}</p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Inherited</p>
            <p className="mt-1 text-2xl font-bold text-teal-600">{inheritedCount}</p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Expiring (30d)</p>
            <p className={`mt-1 text-2xl font-bold ${expiringSoonCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {expiringSoonCount}
            </p>
          </div>
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Expired</p>
            <p className={`mt-1 text-2xl font-bold ${expiredCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {expiredCount}
            </p>
          </div>
        </div>

        {/* Table */}
        {rows.length === 0 ? (
          <div className={`${cardClass} p-10 text-center text-sm text-[var(--color-gray-500)]`}>
            No evidence metadata entries. Evidence is linked from individual control records.
          </div>
        ) : (
          <div className={`${cardClass} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Control</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Run ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">File Path</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">SHA-256</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Linked</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Expires</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map((r) => {
                    const isInherited = r.runId.startsWith("INHERITED-");
                    const { label: statusLabel, cls: statusCls } = evidenceStatus(r.expiresAt);
                    return (
                      <tr key={r.id} className="hover:bg-[var(--color-gray-50)] transition-colors">
                        <td className="px-4 py-3">
                          {r.controlId ? (
                            <Link
                              href={`/assessor/controls/${r.controlId}`}
                              className="font-mono text-xs font-semibold text-[var(--color-navy-primary)] hover:underline"
                            >
                              {r.controlId}
                            </Link>
                          ) : (
                            <span className="text-xs text-[var(--color-gray-400)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isInherited && (
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                                Inherited
                              </span>
                            )}
                            <span className="font-mono text-xs text-[var(--color-gray-700)]">
                              {r.runId.length > 32 ? r.runId.slice(0, 32) + "…" : r.runId}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="block truncate text-xs text-[var(--color-gray-600)]" title={r.filePath}>
                            {r.filePath}
                          </span>
                          {r.description && (
                            <span className="block truncate text-[10px] text-[var(--color-gray-400)]">
                              {r.description}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[10px] text-[var(--color-gray-400)]">
                            {r.sha256Hash.slice(0, 12)}…
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-gray-600)]">
                          {r.source ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-gray-500)]">
                          {r.linkedAt ? r.linkedAt.toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--color-gray-500)]">
                          {r.expiresAt ? r.expiresAt.toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${statusCls}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
