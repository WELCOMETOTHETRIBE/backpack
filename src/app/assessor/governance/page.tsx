import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlRecords,
  governanceManifestRuns,
  governanceDocumentControlLinks,
  governanceDocuments,
  controls,
} from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import Link from "next/link";

function PolicyBadge({ status }: { status: string }) {
  if (status === "satisfied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Satisfied
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Missing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      {status}
    </span>
  );
}

export default async function AssessorGovernancePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") redirect("/auth/signin");

  // ── Manifest runs ─────────────────────────────────────────────────────────
  const manifestRuns = await db
    .select({
      id: governanceManifestRuns.id,
      runId: governanceManifestRuns.runId,
      bundleSource: governanceManifestRuns.bundleSource,
      ingestedAt: governanceManifestRuns.ingestedAt,
      docCount: governanceManifestRuns.docCount,
      schemaVersion: governanceManifestRuns.schemaVersion,
    })
    .from(governanceManifestRuns)
    .where(eq(governanceManifestRuns.organizationId, orgId))
    .orderBy(desc(governanceManifestRuns.ingestedAt));

  // ── Documents ingested (from governance_documents) ────────────────────────
  const docs = await db
    .select({
      id: governanceDocuments.id,
      docId: governanceDocuments.docId,
      title: governanceDocuments.title,
      type: governanceDocuments.type,
      status: governanceDocuments.status,
      updatedAt: governanceDocuments.updatedAt,
    })
    .from(governanceDocuments)
    .where(eq(governanceDocuments.organizationId, orgId))
    .orderBy(asc(governanceDocuments.docId));

  // ── Dual-evidence policy lane status ─────────────────────────────────────
  const policyRecords = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      policyStatus: controlRecords.policyStatus,
      policyDocLinkedAt: controlRecords.policyDocLinkedAt,
      policyDocNarrative: controlRecords.policyDocNarrative,
      title: controls.title,
    })
    .from(controlRecords)
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        eq(controlRecords.policyDocRequired, true)
      )
    )
    .orderBy(asc(controlRecords.controlId));

  const satisfied = policyRecords.filter((r) => r.policyStatus === "satisfied").length;

  const cardClass =
    "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Governance Package</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Read-only view of governance bundle ingest runs, registered documents, and policy lane status.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={cardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Manifest runs</p>
            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">{manifestRuns.length}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {manifestRuns.length > 0
                ? `Last: ${new Date(manifestRuns[0].ingestedAt).toLocaleDateString()}`
                : "None ingested"}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Registered documents</p>
            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">{docs.length}</p>
          </div>
          <div className={cardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Policy lanes satisfied</p>
            <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {satisfied}
              <span className="text-base font-normal text-gray-500"> / {policyRecords.length}</span>
            </p>
          </div>
        </div>

        {/* Manifest runs table */}
        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ingest Run History</h2>
          {manifestRuns.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 italic">No manifest runs recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Run ID</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Ingested</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Docs</th>
                    <th className="pb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Bundle Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {manifestRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300">{run.runId}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-600 dark:text-gray-400">
                        {new Date(run.ingestedAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700 dark:text-gray-300">{run.docCount}</td>
                      <td className="py-2.5 text-xs text-gray-500 break-all">{run.bundleSource ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Policy lane status for dual-evidence controls */}
        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Dual-Evidence Policy Lanes
            <span className="ml-2 text-xs font-normal text-gray-500">
              ({satisfied} / {policyRecords.length} satisfied)
            </span>
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Controls requiring both technical evidence and a policy document.
          </p>
          {policyRecords.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 italic">No dual-evidence controls configured.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Control</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Title</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Policy Status</th>
                    <th className="pb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Linked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {policyRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/assessor/controls/${r.controlId}`}
                          className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {r.controlId}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {r.title ?? r.controlId}
                      </td>
                      <td className="py-2.5 pr-4">
                        <PolicyBadge status={r.policyStatus ?? "missing"} />
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">
                        {r.policyDocLinkedAt
                          ? new Date(r.policyDocLinkedAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Document list */}
        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Registered Documents</h2>
          {docs.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 italic">
              No documents ingested yet. Ask your Compliance Officer to ingest the Governance Bundle manifest.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Code</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Title</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
                    <th className="pb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {docs.map((doc) => (
                    <tr key={doc.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-700 dark:text-gray-300">{doc.docId}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-700 dark:text-gray-300 max-w-xs">{doc.title}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{doc.type}</td>
                      <td className="py-2.5">
                        <span className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                          (doc.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400")
                        }>
                          {doc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
