import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  FileText,
} from "lucide-react";

import {
  getGovernanceAnalysis,
  isGovernance18Control,
} from "@/lib/compliance/governance-18-analysis";
import {
  getControlDocuments,
  type ContractDocument,
  type ControlSummary,
} from "@/lib/integrations/qms-client";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

const QMS_BASE = "https://quality.mactechsolutionsllc.com";

const COVERAGE_STYLE: Record<
  ControlSummary["control_coverage_status"],
  { label: string; cls: string }
> = {
  complete: { label: "Complete", cls: "bg-emerald-100 text-emerald-800" },
  partial: { label: "Partial", cls: "bg-amber-100 text-amber-800" },
  absent: { label: "Absent", cls: "bg-slate-100 text-slate-600" },
};

const APPROVAL_STYLE: Record<
  ContractDocument["approval_status"],
  { label: string; cls: string }
> = {
  effective: { label: "Effective", cls: "bg-emerald-100 text-emerald-800" },
  pending: { label: "Pending release", cls: "bg-amber-100 text-amber-800" },
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  retired: { label: "Retired", cls: "bg-slate-200 text-slate-500" },
};

const REVIEW_STYLE: Record<
  ContractDocument["review_cycle_status"],
  { label: string; cls: string }
> = {
  current: { label: "Current", cls: "bg-emerald-50 text-emerald-700" },
  due_soon: { label: "Due soon", cls: "bg-amber-50 text-amber-700" },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-700" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-800" },
};

const SOURCE_LABEL: Record<ContractDocument["source"], string> = {
  qms_managed: "QMS-managed",
  cmmc_bundle: "CMMC bundle",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function Pill({
  label,
  cls,
  title,
}: {
  label: string;
  cls: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
      title={title}
    >
      {label}
    </span>
  );
}

export const dynamic = "force-dynamic";

export default async function GovernanceControlPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;

  if (!isGovernance18Control(controlId)) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-600">
          {controlId} is not in the 17-control governance set. (Hybrid controls
          like 3.4.3 are adjudicated separately.)
        </p>
        <Link
          href="/dashboard/adjudication/governance"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Governance Controls
        </Link>
      </div>
    );
  }

  const analysis = getGovernanceAnalysis(controlId);
  const contract = await getControlDocuments(controlId);
  const title = analysis?.title ?? controlId;

  const coverageStyle = contract
    ? COVERAGE_STYLE[contract.summary.control_coverage_status]
    : null;

  return (
    <div className="min-h-0 space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Adjudication", href: "/dashboard/adjudication" },
            { label: "Governance", href: "/dashboard/adjudication/governance" },
            { label: controlId },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            href="/dashboard/adjudication/governance"
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Governance Controls
          </Link>
          <span className="text-slate-300">·</span>
          <Link
            href={`/dashboard/cae/${encodeURIComponent(controlId)}/implementation`}
            className="font-medium text-blue-700 hover:underline"
          >
            Adjudication Engine ↗
          </Link>
          <span className="text-slate-300">·</span>
          <Link
            href={`/dashboard/controls?control=${encodeURIComponent(controlId)}`}
            className="font-medium text-blue-700 hover:underline"
          >
            View in SCTM ↗
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {controlId} — {title}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Governance coverage from QMS document control
          </p>
        </div>
        {coverageStyle && (
          <Pill
            label={coverageStyle.label}
            cls={`${coverageStyle.cls} px-3 py-1 text-xs`}
          />
        )}
      </div>

      {contract == null && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">QMS unreachable</p>
            <p className="mt-1">
              We couldn&apos;t load document data for this control. Showing the
              static NIST analysis below; document table will return when QMS
              is reachable again.
            </p>
          </div>
        </div>
      )}

      {/* QMS-derived doc table — the core of the rewrite. Replaces the
          codex-side upload widget + narrative editor. All writes happen in
          QMS now. */}
      {contract && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Documents tagged in QMS ({contract.summary.documents_present})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {contract.summary.documents_current} current ·{" "}
                {contract.summary.documents_due_soon} due soon ·{" "}
                {contract.summary.documents_overdue} overdue
              </p>
            </div>
            <a
              href={`${QMS_BASE}/cmmc/control-tags`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Manage tags in QMS <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {contract.documents.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-slate-500">
              No documents tagged for this control yet. Add a tag in the QMS at{" "}
              <a
                href={`${QMS_BASE}/cmmc/control-tags`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                quality.mactechsolutionsllc.com/cmmc/control-tags
              </a>
              .
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Doc
                  </th>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Source
                  </th>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Approval
                  </th>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Review
                  </th>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Effective / Last reviewed
                  </th>
                  <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Approver
                  </th>
                  <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {contract.documents.map((d) => {
                  const approval = APPROVAL_STYLE[d.approval_status];
                  const review = REVIEW_STYLE[d.review_cycle_status];
                  return (
                    <tr key={`${d.source}:${d.doc_uuid}`}>
                      <td className="px-5 py-3 align-top">
                        <div className="font-mono text-xs font-medium text-slate-900">
                          {d.doc_id}
                        </div>
                        <div className="text-sm text-slate-700">{d.title}</div>
                        {d.current_version && (
                          <div className="text-[11px] text-slate-500">
                            v{d.current_version}
                          </div>
                        )}
                        {d.control_coverage_note && (
                          <div className="mt-1 text-xs italic text-slate-500">
                            “{d.control_coverage_note}”
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {SOURCE_LABEL[d.source]}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <Pill
                          label={approval.label}
                          cls={approval.cls}
                          title={`Native QMS status: ${d.qms_native_status}`}
                        />
                      </td>
                      <td className="px-5 py-3 align-top">
                        <Pill label={review.label} cls={review.cls} />
                        {d.cadence_label && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                            {d.cadence_label}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 align-top text-xs text-slate-600">
                        {d.source === "qms_managed" ? (
                          <>
                            {d.last_reviewed_at ? (
                              <>Last reviewed {fmtDate(d.last_reviewed_at)}</>
                            ) : (
                              <span className="text-slate-400">
                                Never reviewed
                              </span>
                            )}
                            {d.next_review_due_at && (
                              <div className="text-[11px] text-slate-500">
                                Next: {fmtDate(d.next_review_due_at)}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {d.current_version_effective_date ? (
                              <>
                                Effective{" "}
                                {fmtDate(d.current_version_effective_date)}
                              </>
                            ) : (
                              <span className="text-slate-400">
                                No effective date on file
                              </span>
                            )}
                            {d.next_review_due_at && (
                              <div className="text-[11px] text-slate-500">
                                Next: {fmtDate(d.next_review_due_at)}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3 align-top text-xs text-slate-600">
                        {d.approver_name ?? (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        <a
                          href={d.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {analysis && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FileText className="h-4 w-4" />
            Static reference (NIST 800-171 R2 analysis)
          </h2>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              NIST requirement
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              {analysis.nistRequirement}
            </p>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Primary governance documents required
            </h3>
            <ul className="mt-3 space-y-4">
              {analysis.primaryDocuments.map((doc) => (
                <li
                  key={doc.name}
                  className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                >
                  <p className="font-medium text-slate-800">{doc.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    What this document must address:
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                    {doc.whatMustAddress.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Evidence records required
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
              {analysis.evidenceRecordsRequired.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              C3PAO verification focus
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
              {analysis.c3paoVerificationFocus.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
