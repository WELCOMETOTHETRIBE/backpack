import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlRecords,
  governanceDocuments,
  governanceDocumentControlLinks,
  governanceManifestRuns,
  controls,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
} from "@/lib/compliance/control-bins";
import { PackageOpen, BookMarked, FileText, ClipboardList, FolderOpen } from "lucide-react";
import RecalculateButton from "./RecalculateButton";

const DONE_STATUSES = new Set(["implemented", "assessed", "inherited", "not_applicable"]);

// ── Status badges ──────────────────────────────────────────────────────────────

function DoneChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Implemented
    </span>
  );
}

function NeedsTechChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      Waiting for OS evidence
    </span>
  );
}

function NeedsDocsChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      No governance doc
    </span>
  );
}

function NeedsBothChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      Needs docs + evidence
    </span>
  );
}

function DraftOnlyChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      Draft docs only
    </span>
  );
}

function NoDocsChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      No documents mapped
    </span>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l2 2" />
    </svg>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const color = done === total ? "bg-emerald-500" : done === 0 ? "bg-red-400" : "bg-blue-500";
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function GovernanceDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const allGovIds = [...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS];

  const [ctrlRecords, docLinks, govDocs, ctrlTitles, latestRunRows] = await Promise.all([
    db
      .select({
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        technicalStatus: controlRecords.technicalStatus,
      })
      .from(controlRecords)
      .where(and(eq(controlRecords.organizationId, orgId), inArray(controlRecords.controlId, allGovIds))),

    db
      .select({ docCode: governanceDocumentControlLinks.docCode, controlId: governanceDocumentControlLinks.controlId })
      .from(governanceDocumentControlLinks)
      .where(eq(governanceDocumentControlLinks.organizationId, orgId)),

    db
      .select({ docId: governanceDocuments.docId, title: governanceDocuments.title, status: governanceDocuments.status })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId)),

    db
      .select({ controlId: controls.controlId, title: controls.title })
      .from(controls)
      .where(inArray(controls.controlId, allGovIds)),

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
      .limit(1),
  ]);

  const latestRun = latestRunRows[0] ?? null;

  // Build lookup maps
  const recordMap = new Map(ctrlRecords.map((r) => [r.controlId, r]));
  const titleMap = new Map(ctrlTitles.map((c) => [c.controlId, c.title]));
  const docInfoMap = new Map(govDocs.map((d) => [d.docId, { title: d.title, status: d.status }]));

  // controlId → deduplicated doc codes (across all runs)
  const controlDocMap = new Map<string, Set<string>>();
  for (const link of docLinks) {
    if (!controlDocMap.has(link.controlId)) controlDocMap.set(link.controlId, new Set());
    controlDocMap.get(link.controlId)!.add(link.docCode);
  }

  function buildRow(controlId: string) {
    const record = recordMap.get(controlId);
    const docCodes = [...(controlDocMap.get(controlId) ?? [])];
    const docs = docCodes.map((code) => ({
      code,
      ...(docInfoMap.get(code) ?? { title: code, status: "UNKNOWN" }),
    }));
    return {
      controlId,
      title: titleMap.get(controlId) ?? controlId,
      implementationStatus: (record?.implementationStatus ?? "not_started") as string,
      technicalStatus: (record?.technicalStatus ?? "not_started") as string,
      docs,
      hasNonDraftDocs: docs.some((d) => d.status !== "DRAFT"),
    };
  }

  const pureGovRows = PURE_GOVERNANCE_IDS.map(buildRow);
  const hybridGovRows = HYBRID_GOVERNANCE_IDS.map(buildRow);

  const pureDone = pureGovRows.filter((r) => DONE_STATUSES.has(r.implementationStatus)).length;
  const hybridDone = hybridGovRows.filter((r) => DONE_STATUSES.has(r.implementationStatus)).length;
  const pureGapCount = PURE_GOVERNANCE_IDS.length - pureDone;
  const hybridGapCount = HYBRID_GOVERNANCE_IDS.length - hybridDone;

  const card = "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900";
  const thClass = "pb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 text-left";
  const tdClass = "py-2.5 align-top";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Governance Coverage</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {latestRun
                ? `Bundle last ingested ${new Date(latestRun.ingestedAt).toLocaleDateString()} · ${latestRun.docCount} docs · ${latestRun.runId}`
                : "No governance bundle ingested yet — use the button to upload a manifest."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RecalculateButton />
            <Link
              href="/dashboard/governance/upload-manifest"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              <PackageOpen className="h-3.5 w-3.5" aria-hidden />
              Ingest bundle
            </Link>
          </div>
        </div>

        {/* ── Re-ingest nudge (shown when pure gov gaps exist but a bundle is present) ── */}
        {pureGapCount > 0 && latestRun && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-950/20">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
              {pureGapCount} pure governance control{pureGapCount > 1 ? "s" : ""} still show no document coverage.
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              A code fix was applied to supplement QMS CLI control mappings using the static reference map.
              Re-ingesting the same manifest will apply the fix and should close all {PURE_GOVERNANCE_IDS.length} pure gov controls.
            </p>
            <Link
              href="/dashboard/governance/upload-manifest"
              className="mt-2 inline-block text-xs font-semibold text-amber-800 underline hover:no-underline dark:text-amber-300"
            >
              Re-ingest bundle →
            </Link>
          </div>
        )}

        {/* ── Summary pills ───────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pure Governance</p>
              <span className={`text-xs font-medium ${pureDone === PURE_GOVERNANCE_IDS.length ? "text-emerald-600" : "text-amber-600"}`}>
                {pureDone} / {PURE_GOVERNANCE_IDS.length} complete
              </span>
            </div>
            <ProgressBar done={pureDone} total={PURE_GOVERNANCE_IDS.length} />
            <p className="mt-2 text-xs text-gray-500">Satisfied by governance documents alone — no OS evidence required.</p>
            {pureGapCount > 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {pureGapCount} control{pureGapCount > 1 ? "s" : ""} still need document coverage or a re-ingest.
              </p>
            )}
          </div>
          <div className={card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Hybrid Governance</p>
              <span className={`text-xs font-medium ${hybridDone === HYBRID_GOVERNANCE_IDS.length ? "text-emerald-600" : "text-blue-600"}`}>
                {hybridDone} / {HYBRID_GOVERNANCE_IDS.length} complete
              </span>
            </div>
            <ProgressBar done={hybridDone} total={HYBRID_GOVERNANCE_IDS.length} />
            <p className="mt-2 text-xs text-gray-500">Require both a governance document AND OS/technical evidence.</p>
            {hybridGapCount > 0 && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                {hybridGapCount} control{hybridGapCount > 1 ? "s" : ""} are waiting on one or both lanes.
              </p>
            )}
          </div>
        </div>

        {/* ── Pure Governance Controls table ──────────────────────────────────── */}
        <section className={card}>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Pure Governance Controls
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {pureDone} / {PURE_GOVERNANCE_IDS.length}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            A governance document registered in the bundle is the only requirement — no OS scan or cloud evidence needed.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={`${thClass} pr-3 w-20`}>Control</th>
                  <th className={`${thClass} pr-4`}>Requirement</th>
                  <th className={`${thClass} pr-4`}>Documents</th>
                  <th className={`${thClass}`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pureGovRows.map((row) => {
                  const done = DONE_STATUSES.has(row.implementationStatus);
                  const hasDraftOnly = !row.hasNonDraftDocs && row.docs.length > 0;
                  return (
                    <tr key={row.controlId}>
                      <td className={`${tdClass} pr-3`}>
                        <Link
                          href={`/dashboard/governance/controls/${row.controlId}`}
                          className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {row.controlId}
                        </Link>
                      </td>
                      <td className={`${tdClass} pr-4 max-w-xs text-xs text-gray-700 dark:text-gray-300`}>
                        {row.title}
                      </td>
                      <td className={`${tdClass} pr-4`}>
                        {row.docs.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.docs.slice(0, 4).map((doc) => (
                              <span
                                key={doc.code}
                                title={doc.title}
                                className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs ${
                                  doc.status === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : doc.status === "DRAFT"
                                    ? "bg-gray-100 text-gray-500 line-through dark:bg-gray-800"
                                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                }`}
                              >
                                {doc.code}
                              </span>
                            ))}
                            {row.docs.length > 4 && (
                              <span className="text-xs text-gray-400">+{row.docs.length - 4}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={tdClass}>
                        {done ? <DoneChip />
                          : hasDraftOnly ? <DraftOnlyChip />
                          : row.hasNonDraftDocs ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Re-ingest to promote
                            </span>
                          )
                          : <NoDocsChip />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Hybrid Governance Controls table ────────────────────────────────── */}
        <section className={card}>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Hybrid Governance Controls
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {hybridDone} / {HYBRID_GOVERNANCE_IDS.length}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Both lanes must be satisfied: a registered governance document <strong>and</strong> OS or cloud technical evidence (from OS baseline scan or Azure ingest).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={`${thClass} pr-3 w-20`}>Control</th>
                  <th className={`${thClass} pr-4`}>Requirement</th>
                  <th className={`${thClass} pr-3 w-28`}>Gov doc</th>
                  <th className={`${thClass} pr-3 w-32`}>Tech evidence</th>
                  <th className={`${thClass}`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {hybridGovRows.map((row) => {
                  const done = DONE_STATUSES.has(row.implementationStatus);
                  const hasGovDocs = row.hasNonDraftDocs;
                  const hasTech = row.technicalStatus === "satisfied";

                  const evidenceHref = `/dashboard/governance/controls/${row.controlId}/evidence`;

                  let statusChip: React.ReactNode;
                  if (done) statusChip = <DoneChip />;
                  else if (hasGovDocs && !hasTech) statusChip = (
                    <Link href={evidenceHref}>
                      <NeedsTechChip />
                    </Link>
                  );
                  else if (!hasGovDocs && hasTech) statusChip = <NeedsDocsChip />;
                  else statusChip = (
                    <Link href={evidenceHref}>
                      <NeedsBothChip />
                    </Link>
                  );

                  return (
                    <tr key={row.controlId}>
                      <td className={`${tdClass} pr-3`}>
                        <Link
                          href={`/dashboard/governance/controls/${row.controlId}`}
                          className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {row.controlId}
                        </Link>
                      </td>
                      <td className={`${tdClass} pr-4 max-w-xs text-xs text-gray-700 dark:text-gray-300`}>
                        {row.title}
                      </td>
                      <td className={`${tdClass} pr-3`}>
                        {hasGovDocs ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckIcon />
                            {row.docs.length > 0 && (
                              <span className="font-mono">{row.docs[0].code}{row.docs.length > 1 ? ` +${row.docs.length - 1}` : ""}</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <PendingIcon />
                            {row.docs.length > 0 ? "Draft only" : "None"}
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} pr-3`}>
                        {hasTech ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckIcon />
                            Satisfied
                          </span>
                        ) : (
                          <Link
                            href={evidenceHref}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <PendingIcon />
                            Submit evidence →
                          </Link>
                        )}
                      </td>
                      <td className={tdClass}>{statusChip}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Quick nav ───────────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/dashboard/governance/controls", icon: BookMarked, label: "Controls", desc: "Adjudicate and document each control" },
            { href: "/dashboard/governance/documents", icon: FileText, label: "Documents", desc: "Policies, SOPs, plans" },
            { href: "/dashboard/governance/registers", icon: ClipboardList, label: "Registers", desc: "Training, incidents, access logs" },
            { href: "/dashboard/governance/evidence", icon: FolderOpen, label: "Evidence library", desc: "Hybrid control evidence files" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Icon className="h-4 w-4" aria-hidden />
                <span className="text-sm font-semibold">{label}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{desc}</p>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
