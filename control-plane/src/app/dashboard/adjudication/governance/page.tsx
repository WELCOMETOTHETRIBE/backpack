import Link from "next/link";
import { ArrowLeft, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react";

import {
  GOVERNANCE_18_CONTROL_IDS,
  GOVERNANCE_18_ANALYSIS,
} from "@/lib/compliance/governance-18-analysis";
import { getControlSummaries } from "@/lib/integrations/qms-client";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const QMS_BASE = "https://quality.mactechsolutionsllc.com";

const COVERAGE_STYLE: Record<
  "complete" | "partial" | "absent",
  { label: string; cls: string; ringCls: string }
> = {
  complete: {
    label: "Complete",
    cls: "bg-emerald-100 text-emerald-800",
    ringCls: "ring-emerald-200",
  },
  partial: {
    label: "Partial",
    cls: "bg-amber-100 text-amber-800",
    ringCls: "ring-amber-200",
  },
  absent: {
    label: "Absent",
    cls: "bg-slate-100 text-slate-600",
    ringCls: "ring-slate-200",
  },
};

export const dynamic = "force-dynamic";

export default async function Governance18ListPage() {
  // Bulk summaries for all 17 controls in one shot. Returns null on QMS
  // unreachable / auth failure / schema mismatch — we render a degraded
  // banner in that case rather than 500ing.
  const summaries = await getControlSummaries(GOVERNANCE_18_CONTROL_IDS);

  // Map control_id → summary for O(1) lookup in the list render below.
  const byControl = new Map(
    (summaries?.controls ?? []).map((c) => [c.control_id, c.summary])
  );

  return (
    <div className="min-h-0 space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Adjudication", href: "/dashboard/adjudication" },
            { label: "Governance Controls" },
          ]}
        />
        <Link
          href="/dashboard/adjudication"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Adjudication
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          17 Governance Controls
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Document-driven CMMC L2 controls. Coverage is read from the QMS
          contract — to add or rotate documents, manage them in the QMS at{" "}
          <a
            href={`${QMS_BASE}/cmmc/control-tags`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            quality.mactechsolutionsllc.com{" "}
            <ExternalLink className="inline h-3 w-3" />
          </a>
          .
        </p>
      </div>

      {summaries == null && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">QMS unreachable</p>
            <p className="mt-1">
              We couldn&apos;t load coverage data from the document control
              system right now. Per-control detail pages will show a similar
              fallback. Try again in a moment, or check the codex application
              logs for upstream errors.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {GOVERNANCE_18_CONTROL_IDS.map((controlId) => {
            const analysis = GOVERNANCE_18_ANALYSIS[controlId];
            const summary = byControl.get(controlId);
            const coverage = summary?.control_coverage_status;
            const style = coverage ? COVERAGE_STYLE[coverage] : null;
            const title = analysis?.title ?? controlId;

            return (
              <li key={controlId}>
                <Link
                  href={`/dashboard/adjudication/governance/${controlId}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-medium text-slate-800">
                      {controlId}
                    </span>
                    <span className="ml-2 text-sm text-slate-600">{title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {summary && (
                      <span className="text-xs text-slate-500">
                        {summary.documents_present} doc
                        {summary.documents_present === 1 ? "" : "s"}
                        {summary.documents_overdue > 0 && (
                          <span className="ml-1.5 font-medium text-red-700">
                            · {summary.documents_overdue} overdue
                          </span>
                        )}
                        {summary.documents_due_soon > 0 && (
                          <span className="ml-1.5 font-medium text-amber-700">
                            · {summary.documents_due_soon} due soon
                          </span>
                        )}
                      </span>
                    )}
                    {style ? (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${style.cls} ${style.ringCls}`}
                      >
                        {style.label}
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        —
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
