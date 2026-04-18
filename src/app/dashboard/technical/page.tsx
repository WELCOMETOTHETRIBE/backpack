import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlRecords,
  governanceDocumentControlLinks,
  governanceDocuments,
  controls,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  PURE_TECHNICAL_IDS,
  HYBRID_TECHNICAL_IDS,
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
} from "@/lib/compliance/control-bins";
import { Upload, RefreshCw, Server, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import RecalculateTechnicalButton from "./RecalculateTechnicalButton";
import { getControlDisplayTitle } from "@/lib/controls/display-title";

const ALL_HYBRID_IDS = [...new Set([...HYBRID_TECHNICAL_IDS, ...HYBRID_GOVERNANCE_IDS])];
const ALL_IDS = [...new Set([...PURE_TECHNICAL_IDS, ...HYBRID_TECHNICAL_IDS, ...PURE_GOVERNANCE_IDS, ...HYBRID_GOVERNANCE_IDS])];

const DONE = new Set(["implemented", "assessed", "inherited", "not_applicable"]);

function ProgressBar({ done, total, color = "bg-blue-500" }: { done: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-gray-100)]">
      <div
        className={`h-full rounded-full transition-all ${done === total ? "bg-emerald-500" : done === 0 ? "bg-gray-300" : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function LanePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Circle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

export default async function TechnicalDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Fetch all relevant control records + governance links in parallel
  const [records, docLinks, govDocs, ctrlTitles] = await Promise.all([
    db
      .select({
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        technicalStatus: controlRecords.technicalStatus,
      })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId)),

    db
      .select({
        controlId: governanceDocumentControlLinks.controlId,
        docCode: governanceDocumentControlLinks.docCode,
      })
      .from(governanceDocumentControlLinks)
      .where(eq(governanceDocumentControlLinks.organizationId, orgId)),

    db
      .select({ docId: governanceDocuments.docId, status: governanceDocuments.status })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId)),

    db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        nistExactText: controls.nistExactText,
      })
      .from(controls)
      .where(inArray(controls.controlId, ALL_HYBRID_IDS)),
  ]);

  // Build lookup maps
  const recordMap = new Map(records.map((r) => [r.controlId, r]));
  const titleMap = new Map(
    ctrlTitles.map((c) => [c.controlId, getControlDisplayTitle(c, c.controlId)])
  );
  const docStatusMap = new Map(govDocs.map((d) => [d.docId, d.status]));

  // controlId → has at least one non-DRAFT doc
  const controlHasApprovedDoc = new Map<string, boolean>();
  for (const link of docLinks) {
    const status = docStatusMap.get(link.docCode);
    if (status && status !== "DRAFT") {
      controlHasApprovedDoc.set(link.controlId, true);
    } else if (!controlHasApprovedDoc.has(link.controlId)) {
      controlHasApprovedDoc.set(link.controlId, false);
    }
  }

  // Bin counts (3 bins: Pure Technical / Hybrid / Pure Governance)
  const pureTechDone = PURE_TECHNICAL_IDS.filter((id) => DONE.has(recordMap.get(id)?.implementationStatus ?? "")).length;
  const hybridDone = ALL_HYBRID_IDS.filter((id) => DONE.has(recordMap.get(id)?.implementationStatus ?? "")).length;
  const pureGovDone = PURE_GOVERNANCE_IDS.filter((id) => DONE.has(recordMap.get(id)?.implementationStatus ?? "")).length;

  const totalDone = pureTechDone + hybridDone + pureGovDone;
  const totalControls = ALL_IDS.length; // 110

  // Hybrid controls — deduplicated union of both hybrid bins
  const hybridIds = ALL_HYBRID_IDS;
  const hybridRows = hybridIds.map((id) => {
    const rec = recordMap.get(id);
    const govOk = controlHasApprovedDoc.get(id) === true;
    const techOk = rec?.technicalStatus === "satisfied";
    const overallDone = DONE.has(rec?.implementationStatus ?? "");
    return { id, title: titleMap.get(id) ?? id, govOk, techOk, overallDone };
  });

  const hybridComplete = hybridRows.filter((r) => r.overallDone).length;
  const hybridNeedsGov = hybridRows.filter((r) => !r.overallDone && !r.govOk && r.techOk).length;
  const hybridNeedsTech = hybridRows.filter((r) => !r.overallDone && r.govOk && !r.techOk).length;
  const hybridNeedsBoth = hybridRows.filter((r) => !r.overallDone && !r.govOk && !r.techOk).length;

  // Pure technical gaps
  const pureTechGaps = PURE_TECHNICAL_IDS.filter((id) => !DONE.has(recordMap.get(id)?.implementationStatus ?? ""));

  const card = "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Header ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-gray-900)]">Technical Coverage</h1>
            <p className="mt-0.5 text-sm text-[var(--color-gray-500)]">
              {totalDone} / {totalControls} controls satisfied — OS/cloud evidence + governance docs
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/technical/upload"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Upload className="h-4 w-4" />
              Upload evidence
            </Link>
            <RecalculateTechnicalButton />
          </div>
        </div>

        {/* ── 3-bin progress ───────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Pure Technical",
              done: pureTechDone,
              total: PURE_TECHNICAL_IDS.length,
              desc: "Satisfied by OS/cloud evidence alone",
              color: "bg-blue-500",
            },
            {
              label: "Hybrid (Dual-Lane)",
              done: hybridDone,
              total: ALL_HYBRID_IDS.length,
              desc: "Requires both a governance doc and OS/cloud evidence",
              color: "bg-violet-500",
            },
            {
              label: "Pure Governance",
              done: pureGovDone,
              total: PURE_GOVERNANCE_IDS.length,
              desc: "Satisfied by governance documentation alone",
              color: "bg-amber-500",
            },
          ].map(({ label, done, total, desc, color }) => (
            <div key={label} className={card}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">{label}</p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-navy-primary)]">
                {done}
                <span className="text-base font-normal text-[var(--color-gray-400)]"> / {total}</span>
              </p>
              <ProgressBar done={done} total={total} color={color} />
              <p className="mt-1.5 text-xs text-[var(--color-gray-400)]">{desc}</p>
            </div>
          ))}
        </div>

        {/* ── Hybrid controls — both lanes ─────────────────────────────────────── */}
        <section className={card}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">Hybrid Controls</h2>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                {hybridComplete} / {hybridIds.length} complete
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--color-gray-500)]">
              {hybridNeedsBoth > 0 && (
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  {hybridNeedsBoth} need both lanes
                </span>
              )}
              {hybridNeedsTech > 0 && (
                <span className="flex items-center gap-1">
                  <Circle className="h-3.5 w-3.5 text-blue-400" />
                  {hybridNeedsTech} need OS evidence
                </span>
              )}
              {hybridNeedsGov > 0 && (
                <span className="flex items-center gap-1">
                  <Circle className="h-3.5 w-3.5 text-amber-400" />
                  {hybridNeedsGov} need gov doc
                </span>
              )}
            </div>
          </div>
          <p className="mb-4 text-xs text-[var(--color-gray-500)]">
            Each hybrid control requires <strong>both</strong> a governance document (policy/SOP) <strong>and</strong> OS/cloud technical evidence to reach Implemented.
          </p>

          {/* Legend */}
          <div className="mb-3 flex flex-wrap gap-3">
            <Link
              href="/dashboard/technical/upload"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-300"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload governance bundle
            </Link>
            <Link
              href="/dashboard/technical/upload"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-700/40 dark:bg-blue-950/20 dark:text-blue-300"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload OS evidence bundle
            </Link>
            <Link
              href="/dashboard/os-baselines"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-gray-600)] hover:bg-[var(--color-gray-50)]"
            >
              <Server className="h-3.5 w-3.5" />
              System boundary
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)] w-20">Control</th>
                  <th className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">Requirement</th>
                  <th className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)] w-32">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      Gov doc
                    </span>
                  </th>
                  <th className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)] w-32">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      OS evidence
                    </span>
                  </th>
                  <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)] w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {hybridRows.map((row) => (
                  <tr key={row.id} className={row.overallDone ? "opacity-60" : ""}>
                    <td className="py-2.5 pr-3 align-top">
                      <Link
                        href={`/dashboard/governance/controls/${row.id}`}
                        className="font-mono text-xs font-semibold text-[var(--color-blue-accent)] hover:underline"
                      >
                        {row.id}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 align-top">
                      <span className="text-xs text-[var(--color-gray-700)] dark:text-gray-300 line-clamp-2 max-w-xs">
                        {row.title}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <LanePill ok={row.govOk} label={row.govOk ? "Approved" : "Missing"} />
                      {!row.govOk && (
                        <Link
                          href="/dashboard/technical/upload"
                          className="mt-1 block text-xs text-amber-600 hover:underline dark:text-amber-400"
                        >
                          Upload docs →
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <LanePill ok={row.techOk} label={row.techOk ? "Satisfied" : "Pending"} />
                      {!row.techOk && (
                        <Link
                          href="/dashboard/technical/upload"
                          className="mt-1 block text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Upload scan →
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5 align-top">
                      {row.overallDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Done
                        </span>
                      ) : row.govOk && row.techOk ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          <RefreshCw className="h-3 w-3" />
                          Recalculate
                        </span>
                      ) : !row.govOk && !row.techOk ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          <AlertCircle className="h-3 w-3" />
                          Both needed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Circle className="h-3 w-3" />
                          1 lane left
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Pure Technical gaps ──────────────────────────────────────────────── */}
        {pureTechGaps.length > 0 && (
          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">Pure Technical Gaps</h2>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {pureTechGaps.length} remaining
                </span>
              </div>
              <Link
                href="/dashboard/technical/upload"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload OS evidence
              </Link>
            </div>
            <p className="mt-1 mb-3 text-xs text-[var(--color-gray-500)]">
              These controls require only OS or cloud evidence — no governance docs needed.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pureTechGaps.map((id) => {
                const rec = recordMap.get(id);
                const hasTechEvidence = rec?.technicalStatus === "satisfied";
                return (
                  <Link
                    key={id}
                    href={`/dashboard/technical/controls?classification=TECHNICAL`}
                    className={`rounded px-2 py-1 font-mono text-xs font-medium ${
                      hasTechEvidence
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                    title={hasTechEvidence ? "Evidence collected — recalculate to promote" : "No evidence yet"}
                  >
                    {id}
                  </Link>
                );
              })}
            </div>
            {pureTechGaps.some((id) => recordMap.get(id)?.technicalStatus === "satisfied") && (
              <p className="mt-3 text-xs text-blue-600 dark:text-blue-400">
                Some controls have evidence collected (shown in blue) — click Recalculate Status to promote them.
              </p>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
