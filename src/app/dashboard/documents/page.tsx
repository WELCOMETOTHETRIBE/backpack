import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  governanceDocuments,
  governanceDocumentControlLinks,
  governanceManifestRuns,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import {
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  ChevronRight,
  Calendar,
} from "lucide-react";
import {
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
} from "@/lib/compliance/control-bins";

const ALL_GOV_CONTROL_IDS = [...new Set([...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS])];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  SUBMITTED: { label: "Submitted", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  RETIRED: { label: "Retired", cls: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500" },
  DRAFT: { label: "Draft", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays < 90 && diffDays > 0;
}

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default async function DocumentsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [docs, docLinks, runs] = await Promise.all([
    db
      .select({
        id: governanceDocuments.id,
        docId: governanceDocuments.docId,
        title: governanceDocuments.title,
        type: governanceDocuments.type,
        domain: governanceDocuments.domain,
        version: governanceDocuments.version,
        status: governanceDocuments.status,
        approvalDate: governanceDocuments.approvalDate,
        nextReviewDate: governanceDocuments.nextReviewDate,
      })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId))
      .orderBy(governanceDocuments.docId),

    db
      .select({
        docCode: governanceDocumentControlLinks.docCode,
        controlId: governanceDocumentControlLinks.controlId,
      })
      .from(governanceDocumentControlLinks)
      .where(eq(governanceDocumentControlLinks.organizationId, orgId)),

    db
      .select({
        runId: governanceManifestRuns.runId,
        ingestedAt: governanceManifestRuns.ingestedAt,
        docCount: governanceManifestRuns.docCount,
        bundleSource: governanceManifestRuns.bundleSource,
      })
      .from(governanceManifestRuns)
      .where(eq(governanceManifestRuns.organizationId, orgId))
      .orderBy(desc(governanceManifestRuns.ingestedAt))
      .limit(5),
  ]);

  // Build doc → controls map
  const docControlMap = new Map<string, Set<string>>();
  for (const link of docLinks) {
    if (!docControlMap.has(link.docCode)) docControlMap.set(link.docCode, new Set());
    docControlMap.get(link.docCode)!.add(link.controlId);
  }

  // Build control → docs map (to find coverage gaps)
  const controlDocMap = new Map<string, Set<string>>();
  for (const link of docLinks) {
    if (!controlDocMap.has(link.controlId)) controlDocMap.set(link.controlId, new Set());
    controlDocMap.get(link.controlId)!.add(link.docCode);
  }

  const approvedDocIds = new Set(docs.filter((d) => d.status !== "DRAFT").map((d) => d.docId));

  // Controls with no approved doc coverage
  const gapControls = ALL_GOV_CONTROL_IDS.filter((id) => {
    const mapped = controlDocMap.get(id);
    if (!mapped || mapped.size === 0) return true;
    // Check if any mapped doc is non-DRAFT
    return ![...mapped].some((code) => approvedDocIds.has(code));
  });

  const latestRun = runs[0] ?? null;
  const approvedCount = docs.filter((d) => d.status === "APPROVED").length;
  const submittedCount = docs.filter((d) => d.status === "SUBMITTED").length;
  const draftCount = docs.filter((d) => d.status === "DRAFT").length;

  const reviewOverdue = docs.filter((d) => isOverdue(d.nextReviewDate));
  const reviewSoon = docs.filter((d) => !isOverdue(d.nextReviewDate) && isExpiringSoon(d.nextReviewDate));

  const card = "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Header ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-gray-900)]">Documents</h1>
            <p className="mt-0.5 text-sm text-[var(--color-gray-500)]">
              Governance document library — populated from QMS CLI manifest bundles
            </p>
          </div>
          <Link
            href="/dashboard/technical/upload"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            <Upload className="h-4 w-4" />
            Upload governance bundle
          </Link>
        </div>

        {/* ── No docs state ─────────────────────────────────────────────────────── */}
        {docs.length === 0 && (
          <section className={`${card} p-8 text-center`}>
            <Package className="mx-auto h-10 w-10 text-[var(--color-gray-300)]" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--color-gray-700)]">No governance documents yet</h2>
            <p className="mt-1 text-sm text-[var(--color-gray-500)]">
              Upload your QMS CLI governance manifest bundle to register policies, SOPs, and plans.
            </p>
            <Link
              href="/dashboard/technical/upload"
              className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Upload className="h-4 w-4" />
              Upload governance bundle
            </Link>
          </section>
        )}

        {docs.length > 0 && (
          <>
            {/* ── Stats row ───────────────────────────────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Total docs", value: docs.length, icon: FileText, color: "text-[var(--color-navy-primary)]" },
                { label: "Approved", value: approvedCount, icon: CheckCircle2, color: "text-emerald-600" },
                { label: "Submitted", value: submittedCount, icon: Clock, color: "text-blue-600" },
                { label: "Draft", value: draftCount, icon: FileText, color: "text-[var(--color-gray-400)]" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className={`${card} p-4`}>
                  <div className={`flex items-center gap-2 ${color}`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium text-[var(--color-gray-500)]">{label}</span>
                  </div>
                  <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* ── Latest ingest runs ───────────────────────────────────────────────── */}
            {latestRun && (
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">Ingest history</h2>
                  <Link
                    href="/dashboard/technical/upload"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Re-ingest bundle
                  </Link>
                </div>
                <div className="space-y-2">
                  {runs.map((run) => (
                    <div key={run.runId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5">
                      <div>
                        <span className="font-mono text-xs font-semibold text-[var(--color-gray-800)]">{run.runId}</span>
                        {run.bundleSource && (
                          <span className="ml-2 text-xs text-[var(--color-gray-400)]">{run.bundleSource}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-gray-500)]">
                        <span>{run.docCount} docs</span>
                        <span>{new Date(run.ingestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Review alerts ────────────────────────────────────────────────────── */}
            {(reviewOverdue.length > 0 || reviewSoon.length > 0) && (
              <section className={`${card} p-5`}>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-gray-900)]">Review alerts</h2>
                <div className="space-y-2">
                  {reviewOverdue.map((doc) => (
                    <div key={doc.docId} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-800/40 dark:bg-red-950/20">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      <span className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">{doc.docId}</span>
                      <span className="text-xs text-red-700 dark:text-red-400">{doc.title}</span>
                      <span className="ml-auto text-xs text-red-600">Review overdue — {doc.nextReviewDate}</span>
                    </div>
                  ))}
                  {reviewSoon.map((doc) => (
                    <div key={doc.docId} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-700/40 dark:bg-amber-950/20">
                      <Calendar className="h-4 w-4 shrink-0 text-amber-500" />
                      <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">{doc.docId}</span>
                      <span className="text-xs text-amber-700 dark:text-amber-400">{doc.title}</span>
                      <span className="ml-auto text-xs text-amber-600">Review due — {doc.nextReviewDate}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Document library ─────────────────────────────────────────────────── */}
            <section className={card}>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-6 py-4">
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                  Document library
                  <span className="ml-2 font-normal text-[var(--color-gray-400)]">({docs.length})</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Doc ID", "Title", "Type", "Version", "Status", "Controls", "Next Review"].map((h) => (
                        <th key={h} className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {docs.map((doc) => {
                      const controls = [...(docControlMap.get(doc.docId) ?? [])];
                      const overdue = isOverdue(doc.nextReviewDate);
                      const soon = isExpiringSoon(doc.nextReviewDate);
                      return (
                        <tr key={doc.id} className={doc.status === "DRAFT" ? "opacity-60" : ""}>
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-semibold text-[var(--color-gray-800)]">
                              {doc.docId}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <span className="text-xs text-[var(--color-gray-700)] line-clamp-2">{doc.title}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-[var(--color-gray-500)]">{doc.type}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-[var(--color-gray-400)]">v{doc.version ?? "1"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={doc.status} />
                          </td>
                          <td className="py-3 px-4">
                            {controls.length === 0 ? (
                              <span className="text-xs text-[var(--color-gray-400)] italic">none mapped</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {controls.slice(0, 4).map((id) => (
                                  <Link
                                    key={id}
                                    href={`/dashboard/governance/controls/${id}`}
                                    className="rounded bg-[var(--color-gray-100)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-gray-600)] hover:bg-[var(--color-gray-200)] dark:bg-gray-800 dark:text-gray-400"
                                  >
                                    {id}
                                  </Link>
                                ))}
                                {controls.length > 4 && (
                                  <span className="text-xs text-[var(--color-gray-400)]">+{controls.length - 4}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {doc.nextReviewDate ? (
                              <span className={`text-xs ${overdue ? "font-semibold text-red-600" : soon ? "font-semibold text-amber-600" : "text-[var(--color-gray-400)]"}`}>
                                {overdue && <AlertCircle className="mr-1 inline h-3 w-3" />}
                                {doc.nextReviewDate}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--color-gray-300)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Coverage gaps ────────────────────────────────────────────────────── */}
            {gapControls.length > 0 && (
              <section className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">Coverage gaps</h2>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {gapControls.length} controls
                  </span>
                </div>
                <p className="mb-3 text-xs text-[var(--color-gray-500)]">
                  These governance controls have no approved document mapped. Re-ingest a bundle with updated mappings, or map docs manually.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gapControls.map((id) => (
                    <Link
                      key={id}
                      href={`/dashboard/governance/controls/${id}`}
                      className="rounded bg-amber-50 px-2 py-1 font-mono text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
                    >
                      {id}
                    </Link>
                  ))}
                </div>
                <div className="mt-4 flex gap-3">
                  <Link
                    href="/dashboard/technical/upload"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-300"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Re-ingest governance bundle
                  </Link>
                  <Link
                    href="/dashboard/governance"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    View Governance Coverage
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}
