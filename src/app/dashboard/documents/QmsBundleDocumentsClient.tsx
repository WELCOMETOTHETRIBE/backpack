"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Package,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  Clock,
  Search,
  FileText,
  ChevronRight,
} from "lucide-react";

// ── Types (mirror server/page.tsx) ───────────────────────────────────────────

export interface QmsRun {
  runId: string;
  schemaVersion: string;
  generatedAt: string;
  receivedAt: string;
  generatedBy: string | null;
  toolVersion?: string | null;
  source?: string | null;
  docCount: number;
  controlsTouched?: string[];
  contentHash: string;
  signingHash?: string | null;
  signatureKid?: string | null;
  issuerService?: string | null;
  issuerUrl?: string | null;
}

export interface QmsDocSignature {
  signerName: string | null;
  signerEmail: string | null;
  signatureMeaning: string | null;
  signedAt: string | null;
  signatureHash: string | null;
}

export interface QmsDoc {
  documentNumber: string;
  documentName: string;
  documentType: string | null;
  version: string | null;
  status: string | null;
  effectiveDate: string | null;
  nextReviewDate: string | null;
  sha256: string;
  released: boolean;
  releasedAt: string | null;
  controlsMapped: string[];
  signatures: QmsDocSignature[];
}

export interface OisImpact {
  controlId: string;
  generatedAt: string;
  mostRecentEvidenceAt: string | null;
}

interface Props {
  orgName: string;
  latestRun: QmsRun | null;
  runHistory: QmsRun[];
  docs: QmsDoc[];
  oisImpact: OisImpact[];
  controlsWithBackingCount: number;
}

// QMS public surface — used to deep-link doc cards back to the source.
const QMS_BASE = "https://quality.mactechsolutionsllc.com";

const TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure / SOP",
  plan: "Plan",
  ssp: "System Security Plan",
  security_guide: "Security Guide",
  assessment: "Assessment",
};

const SIG_STYLES: Record<string, string> = {
  Reviewer: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Approver:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "Quality Release":
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortHash(h: string | null | undefined, n = 12): string {
  if (!h) return "—";
  const cleaned = h.replace(/^sha256:/, "");
  return cleaned.length > n ? `${cleaned.slice(0, n)}…` : cleaned;
}

function StatusPill({
  released,
  status,
}: {
  released: boolean;
  status: string | null;
}) {
  if (released && status === "effective") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Released · Effective
      </span>
    );
  }
  if (status === "effective") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        Effective (unreleased)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
      {status ?? "unknown"}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function QmsBundleDocumentsClient({
  orgName,
  latestRun,
  runHistory,
  docs,
  oisImpact,
  controlsWithBackingCount,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showRunHistory, setShowRunHistory] = useState(false);

  const docTypes = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs) if (d.documentType) set.add(d.documentType);
    return Array.from(set).sort();
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (typeFilter !== "all" && d.documentType !== typeFilter) return false;
      if (!q) return true;
      return (
        d.documentNumber.toLowerCase().includes(q) ||
        d.documentName.toLowerCase().includes(q) ||
        d.controlsMapped.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [docs, search, typeFilter]);

  if (!latestRun) {
    return (
      <div className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            QMS Governance Bundle
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Live view of the document set ingested from MacTech Quality (QMS).
          </p>
        </header>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:border-gray-700 dark:bg-gray-900/40">
          <Package className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            No QMS manifest has been ingested for {orgName} yet.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            When QMS publishes a Determinate MacTech Vault Governance
            Package, it lands here automatically via{" "}
            <code>/api/integrations/qms-manifest/ingest</code>.
          </p>
        </div>
      </div>
    );
  }

  const released = docs.filter((d) => d.released).length;
  const unreleased = docs.length - released;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            QMS Governance Bundle
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Live view of the document set ingested from MacTech Quality
            (QMS) for <strong>{orgName}</strong>. Each document carries
            its full e-signature chain and contributes mechanism evidence
            to the controls listed below.
          </p>
        </div>
        <Link
          href={QMS_BASE}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Open MacTech Quality (QMS)
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Latest release hero */}
      <section className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-gray-900">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Latest QMS release
            </h2>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {latestRun.schemaVersion}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            received {fmtDateTime(latestRun.receivedAt)}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              run_id
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-gray-800 dark:text-gray-200">
              {latestRun.runId}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              documents
            </dt>
            <dd className="mt-0.5 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {latestRun.docCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              controls touched
            </dt>
            <dd className="mt-0.5 text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {latestRun.controlsTouched?.length ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-500">
              controls backed (effective)
            </dt>
            <dd className="mt-0.5 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              {controlsWithBackingCount}
            </dd>
          </div>
        </dl>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="uppercase tracking-wider text-gray-500">
              content_hash
            </dt>
            <dd className="font-mono text-gray-700 dark:text-gray-300">
              {shortHash(latestRun.contentHash, 18)}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wider text-gray-500">
              signing key
            </dt>
            <dd className="font-mono text-gray-700 dark:text-gray-300">
              {latestRun.signatureKid ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-wider text-gray-500">
              generated by
            </dt>
            <dd className="text-gray-700 dark:text-gray-300">
              {latestRun.generatedBy ?? "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              {released} released
            </span>
            {unreleased > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 text-amber-600" />
                {unreleased} unreleased
              </span>
            )}
            {oisImpact.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {oisImpact.length} OIS narrative{oisImpact.length === 1 ? "" : "s"} refreshed by this release
              </span>
            )}
          </div>
          {runHistory.length > 1 && (
            <button
              onClick={() => setShowRunHistory((v) => !v)}
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {showRunHistory ? "Hide" : "Show"} run history ({runHistory.length})
            </button>
          )}
        </div>
      </section>

      {/* Run history */}
      {showRunHistory && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Run history
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left uppercase tracking-wider text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-4">received</th>
                  <th className="py-2 pr-4">run_id</th>
                  <th className="py-2 pr-4">schema</th>
                  <th className="py-2 pr-4">docs</th>
                  <th className="py-2 pr-4">generated by</th>
                  <th className="py-2 pr-4">content_hash</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((r) => (
                  <tr
                    key={r.runId}
                    className={`border-b border-gray-100 dark:border-gray-800 ${r.runId === latestRun.runId ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""}`}
                  >
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                      {fmtDateTime(r.receivedAt)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-700 dark:text-gray-300">
                      {r.runId}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {r.schemaVersion}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">
                      {r.docCount}
                    </td>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                      {r.generatedBy ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-500">
                      {shortHash(r.contentHash, 14)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* OIS impact strip — controls whose narrative was refreshed by this run */}
      {oisImpact.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Control implementations refreshed by this release
            </h3>
            <span className="text-xs text-gray-500">
              click any control to view its OIS narrative
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {oisImpact.map((o) => (
              <Link
                key={o.controlId}
                href={`/dashboard/controls/${encodeURIComponent(o.controlId)}`}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                title={`refreshed ${fmtDateTime(o.generatedAt)}`}
              >
                {o.controlId}
                <ChevronRight className="h-3 w-3 opacity-60" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Doc list controls */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Documents in this release ({docs.length})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="all">All types</option>
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, title, control…"
                className="w-72 rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            </div>
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No documents match the current filter.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredDocs.map((d) => (
              <DocRow key={d.documentNumber} doc={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Per-doc row ──────────────────────────────────────────────────────────────

function DocRow({ doc }: { doc: QmsDoc }) {
  const [expanded, setExpanded] = useState(false);
  const qmsUrl = `${QMS_BASE}/documents/by-code/${encodeURIComponent(doc.documentNumber)}`;
  const sortedSigs = [...doc.signatures].sort((a, b) => {
    const order = (m: string | null) =>
      m === "Reviewer" ? 0 : m === "Approver" ? 1 : m === "Quality Release" ? 2 : 3;
    return order(a.signatureMeaning) - order(b.signatureMeaning);
  });

  return (
    <li className="p-4 transition hover:bg-gray-50 dark:hover:bg-gray-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <Link
              href={qmsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {doc.documentNumber}
            </Link>
            {doc.version && (
              <span className="text-xs text-gray-500">v{doc.version}</span>
            )}
            <StatusPill released={doc.released} status={doc.status} />
            {doc.documentType && (
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                {TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">
            {doc.documentName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {doc.controlsMapped.length === 0 ? (
              <span className="text-xs italic text-gray-400">
                no control mapping (auditor follow-up: tag in /cmmc/control-tags on QMS)
              </span>
            ) : (
              doc.controlsMapped.map((c) => (
                <Link
                  key={c}
                  href={`/dashboard/controls/${encodeURIComponent(c)}`}
                  className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
                >
                  {c}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Link
            href={qmsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Open in QMS
            <ExternalLink className="h-3 w-3" />
          </Link>
          {doc.releasedAt && (
            <span className="text-[11px] text-gray-500">
              released {fmtDate(doc.releasedAt)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
      >
        {expanded ? "Hide signature chain & hash" : `Signature chain (${sortedSigs.length}) & hash`}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/60">
          <div>
            <span className="text-gray-500">sha256: </span>
            <span className="font-mono text-gray-700 dark:text-gray-300">
              {shortHash(doc.sha256, 24)}
            </span>
          </div>
          {sortedSigs.length === 0 ? (
            <p className="italic text-gray-500">No signatures recorded.</p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr className="text-left uppercase tracking-wider text-gray-500">
                  <th className="py-1 pr-4">role</th>
                  <th className="py-1 pr-4">signer</th>
                  <th className="py-1 pr-4">at</th>
                  <th className="py-1 pr-4">signature_hash</th>
                </tr>
              </thead>
              <tbody>
                {sortedSigs.map((s, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${SIG_STYLES[s.signatureMeaning ?? ""] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {s.signatureMeaning ?? "—"}
                      </span>
                    </td>
                    <td className="py-1 pr-4 text-gray-700 dark:text-gray-300">
                      {s.signerName ?? s.signerEmail ?? "—"}
                    </td>
                    <td className="py-1 pr-4 text-gray-600">
                      {fmtDateTime(s.signedAt)}
                    </td>
                    <td className="py-1 pr-4 font-mono text-gray-500">
                      {shortHash(s.signatureHash, 14)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {doc.nextReviewDate && (
            <div className="text-gray-500">
              next review: {fmtDate(doc.nextReviewDate)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
