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

/**
 * Library-mode doc: same shape as a release-mode doc, plus two
 * library-only fields:
 *   - versionCount: how many distinct versions of this document_number
 *     exist in qms_governance_manifest_documents for this org. Powers
 *     the "n versions" badge.
 *   - sourceRunId: the run_id of the manifest the visible row came
 *     from (the most recent released or, fallback, most recent
 *     updated). Lets the UI link back to that release for context.
 */
export interface LibraryDoc extends QmsDoc {
  versionCount: number;
  sourceRunId: string;
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
  /**
   * Persistent library — most recent version of every document_number
   * for this org, regardless of whether it's in the latest release.
   * One row per unique document_number; carries versionCount so the
   * UI can show "this doc has n versions on file" without a second
   * round-trip.
   */
  libraryDocs: LibraryDoc[];
  oisImpact: OisImpact[];
  controlsWithBackingCount: number;
  /**
   * Map of control code (e.g. "AC.L2-3.1.1" or bare "3.1.1") to this org's
   * control_implementations.id, which is what /dashboard/controls/[id]
   * expects. Codes missing from the map fall back to the legacy code-as-id
   * URL — still 404, but at least visibly distinguishable.
   */
  controlCodeToImplId: Record<string, string>;
  /**
   * Map of QMS document_number (e.g. "SSP-017") → Codex
   * ssp_documents.id. When a Library row's document_type='ssp' has
   * a matching entry here, the row renders a "View in SSP" pivot
   * button that deep-links to /dashboard/ssp for drift / signoff /
   * citation context. Empty for orgs that haven't submitted any SSP
   * to Doc Control yet.
   */
  sspIdByQmsDocNumber: Record<string, string>;
}

function controlHref(code: string, map: Record<string, string>): string {
  const id = map[code];
  if (id) return `/dashboard/controls/${encodeURIComponent(id)}`;
  // Fall back to the public controls index with the code as a hash so the
  // user lands somewhere coherent even if no impl row exists for this org.
  return `/dashboard/controls#${encodeURIComponent(code)}`;
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

// Signature-role pill tones — same 50/100/700 grammar as PILL_TONES so
// signature pills sit visually flush with the rest of the page.
const SIG_STYLES: Record<string, string> = {
  Reviewer:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60",
  Approver:
    "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60",
  "Quality Release":
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
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

/* ── Pill primitives ────────────────────────────────────────────────────────
 *
 * One canonical visual grammar for every chip on this page. Three variants
 * (status / link / count) cover everything; tones are kept subtle (50-tier
 * background, 700-tier text, no hard borders) so a wall of pills reads as
 * meta-information rather than a Christmas tree.
 *
 * Heights are uniform (h-5 = 20px) and padding is symmetric (px-2 py-0)
 * so neighboring pills line up on the same baseline regardless of icon
 * presence — the proportionate look the feedback was asking for.
 */

const PILL_BASE =
  "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none whitespace-nowrap";

const PILL_TONES = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
  blue:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60",
  amber:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60",
  slate:
    "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800",
  ghost:
    "bg-transparent text-gray-500 dark:text-gray-400",
} as const;

const LINK_PILL_BASE =
  `${PILL_BASE} font-mono tracking-tight transition-colors duration-150`;

const LINK_PILL_TONES = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 hover:bg-emerald-100 hover:text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60 dark:hover:bg-emerald-900/40",
  blue:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100 hover:bg-blue-100 hover:text-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60 dark:hover:bg-blue-900/40",
} as const;

function StatusPill({
  released,
  status,
}: {
  released: boolean;
  status: string | null;
}) {
  if (released && status === "effective") {
    return (
      <span className={`${PILL_BASE} ${PILL_TONES.emerald}`}>
        <CheckCircle2 className="h-3 w-3" />
        Released · Effective
      </span>
    );
  }
  if (status === "effective") {
    return (
      <span className={`${PILL_BASE} ${PILL_TONES.blue}`}>
        Effective · unreleased
      </span>
    );
  }
  return (
    <span className={`${PILL_BASE} ${PILL_TONES.slate}`}>
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
  libraryDocs,
  oisImpact,
  controlsWithBackingCount,
  controlCodeToImplId,
  sspIdByQmsDocNumber,
}: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showRunHistory, setShowRunHistory] = useState(false);
  /**
   * Tab state.
   *   "release" — documents in the latest QMS release (the original view)
   *   "library" — most-recent version of every document the org has
   *               ever ingested, regardless of release. Persists across
   *               releases so a doc that drops out of the active release
   *               still surfaces in the library.
   */
  const [view, setView] = useState<"release" | "library">("release");

  // Type filter and search box drive both views; the active source is
  // chosen by `view`. Library docs share the QmsDoc shape so the same
  // filter/render path works.
  const activeSource: QmsDoc[] = view === "library" ? libraryDocs : docs;

  const docTypes = useMemo(() => {
    const set = new Set<string>();
    for (const d of activeSource) if (d.documentType) set.add(d.documentType);
    return Array.from(set).sort();
  }, [activeSource]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeSource.filter((d) => {
      if (typeFilter !== "all" && d.documentType !== typeFilter) return false;
      if (!q) return true;
      return (
        d.documentNumber.toLowerCase().includes(q) ||
        d.documentName.toLowerCase().includes(q) ||
        d.controlsMapped.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [activeSource, search, typeFilter]);

  /**
   * Library-mode lookup: document_number → versionCount. Used by the
   * DocRow renderer to show a "n versions" badge when in library view.
   * Empty in release view so the badge doesn't appear there.
   */
  const versionCountByDoc = useMemo(() => {
    const map = new Map<string, number>();
    if (view === "library") {
      for (const d of libraryDocs) map.set(d.documentNumber, d.versionCount);
    }
    return map;
  }, [view, libraryDocs]);

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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${PILL_BASE} ${PILL_TONES.emerald}`}>
              <CheckCircle2 className="h-3 w-3" />
              {released} released
            </span>
            {unreleased > 0 && (
              <span className={`${PILL_BASE} ${PILL_TONES.amber}`}>
                <Clock className="h-3 w-3" />
                {unreleased} unreleased
              </span>
            )}
            {oisImpact.length > 0 && (
              <span className={`${PILL_BASE} ${PILL_TONES.emerald}`}>
                {oisImpact.length} OIS narrative{oisImpact.length === 1 ? "" : "s"} refreshed
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

      {/* OIS impact strip — controls whose narrative was refreshed by this run.
          Refresh timestamp surfaces once at the section caption instead of as
          a hidden per-pill tooltip, so the pills below stay as a clean, even
          row of control codes. */}
      {oisImpact.length > 0 && (() => {
        const newestRefresh = oisImpact.reduce<string | null>(
          (acc, o) => (acc && acc > o.generatedAt ? acc : o.generatedAt),
          null,
        );
        return (
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Control implementations refreshed by this release
              </h3>
              <span className="text-xs text-gray-500">
                {newestRefresh && (
                  <>
                    refreshed {fmtDateTime(newestRefresh)}
                    <span className="mx-1.5 text-gray-300" aria-hidden>·</span>
                  </>
                )}
                click any control to view its OIS narrative
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {oisImpact.map((o) => (
                <Link
                  key={o.controlId}
                  href={controlHref(o.controlId, controlCodeToImplId)}
                  className={`${LINK_PILL_BASE} ${LINK_PILL_TONES.emerald}`}
                  aria-label={`${o.controlId} — OIS narrative refreshed ${fmtDateTime(o.generatedAt)}`}
                >
                  {o.controlId}
                </Link>
              ))}
            </div>
          </section>
        );
      })()}

      {/* View tabs — release vs library.
          Release tab shows only docs in the latest QMS run. Library
          tab shows the most-recent version of every document_number
          this org has ever ingested, so a doc that drops from the
          active release still surfaces here. */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div
          className="flex items-center gap-1 border-b border-gray-200 px-2 pt-2 dark:border-gray-800"
          role="tablist"
          aria-label="Document view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "release"}
            onClick={() => setView("release")}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition ${
              view === "release"
                ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            This release ({docs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "library"}
            onClick={() => setView("library")}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium transition ${
              view === "library"
                ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
            title="Most recent version of every document this org has ingested, regardless of release."
          >
            Library ({libraryDocs.length})
          </button>
          <span className="ml-auto pr-2 text-[11px] text-gray-500">
            {view === "library"
              ? "Persistent across releases · latest version per document"
              : `From run ${latestRun.runId.slice(0, 8)}…`}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {view === "library"
                ? `All documents · library (${filteredDocs.length}/${libraryDocs.length})`
                : `Documents in this release (${filteredDocs.length}/${docs.length})`}
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
              <DocRow
                key={d.documentNumber}
                doc={d}
                controlCodeToImplId={controlCodeToImplId}
                versionCount={versionCountByDoc.get(d.documentNumber) ?? null}
                sspDocumentId={sspIdByQmsDocNumber[d.documentNumber] ?? null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Per-doc row ──────────────────────────────────────────────────────────────

function DocRow({
  doc,
  controlCodeToImplId,
  versionCount,
  sspDocumentId,
}: {
  doc: QmsDoc;
  controlCodeToImplId: Record<string, string>;
  /**
   * Number of distinct versions of this document_number on file for
   * the org. Set in library mode (where it's the entire point of the
   * view) and null in release mode (where every visible doc is by
   * definition the latest of itself in the active run).
   */
  versionCount: number | null;
  /**
   * When document_type='ssp' AND a released ssp_doc_control_submissions
   * row matches this document_number, this is the Codex
   * ssp_documents.id — drives the "View in SSP" pivot back to
   * /dashboard/ssp. Null for non-SSP docs and SSPs without a Codex
   * submission match (which shouldn't happen for QMS-released SSPs but
   * the row stays usable either way).
   */
  sspDocumentId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAllControls, setShowAllControls] = useState(false);

  // Link to the read-only "presentation view" on QMS (C3PAO-friendly,
  // beautifully-rendered MD with the full signature chain visible). Not
  // the editable detail page.
  const qmsUrl = `${QMS_BASE}/documents/by-code/${encodeURIComponent(doc.documentNumber)}/view`;
  const sortedSigs = [...doc.signatures].sort((a, b) => {
    const order = (m: string | null) =>
      m === "Reviewer" ? 0 : m === "Approver" ? 1 : m === "Quality Release" ? 2 : 3;
    return order(a.signatureMeaning) - order(b.signatureMeaning);
  });

  // SSP-typed docs are authorizing records, not policies — treat them
  // visually distinct and offer a "View in SSP" pivot back to the
  // Codex SSP detail page.
  const isSsp = doc.documentType === "ssp";

  // Cap the controls-mapped pill wall. SSPs cover all 110 L2 controls;
  // rendering 110 pills inline is unusable. Show first 12 + an "all N"
  // toggle for any doc with too many.
  const CONTROLS_CAP = 12;
  const displayedControls =
    showAllControls || doc.controlsMapped.length <= CONTROLS_CAP
      ? doc.controlsMapped
      : doc.controlsMapped.slice(0, CONTROLS_CAP);
  const hiddenControlsCount = doc.controlsMapped.length - displayedControls.length;

  // Background tint: SSPs get a faint sky tint so they stand out in a
  // sea of policies/procedures.
  const rowBg = isSsp
    ? "bg-sky-50/40 hover:bg-sky-50/60 dark:bg-sky-950/20 dark:hover:bg-sky-950/30"
    : "hover:bg-gray-50 dark:hover:bg-gray-900/40";

  return (
    <li className={`p-4 transition ${rowBg}`}>
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
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  isSsp
                    ? "rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                    : "text-gray-500"
                }`}
              >
                {isSsp && "★ "}
                {TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
            )}
            {versionCount !== null && versionCount > 1 && (
              <span
                className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                title={`${versionCount} versions on file across all releases`}
              >
                {versionCount} versions
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">
            {doc.documentName}
            {isSsp && (
              <span className="ml-2 text-[11px] italic text-sky-700 dark:text-sky-400">
                Authorizing record · CA.L2-3.12.4
              </span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {doc.controlsMapped.length === 0 ? (
              <span className="text-xs italic text-gray-400">
                no control mapping (auditor follow-up: tag in /cmmc/control-tags on QMS)
              </span>
            ) : (
              <>
                {displayedControls.map((c) => (
                  <Link
                    key={c}
                    href={controlHref(c, controlCodeToImplId)}
                    className={`${LINK_PILL_BASE} ${LINK_PILL_TONES.blue}`}
                  >
                    {c}
                  </Link>
                ))}
                {hiddenControlsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllControls(true)}
                    className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    title={`Show all ${doc.controlsMapped.length} controls this doc maps to`}
                  >
                    + {hiddenControlsCount} more
                  </button>
                )}
                {showAllControls && doc.controlsMapped.length > CONTROLS_CAP && (
                  <button
                    type="button"
                    onClick={() => setShowAllControls(false)}
                    className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                  >
                    collapse
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {/* SSP-specific pivot: jump from the QMS Library back to the
              Codex SSP detail page where drift / signoffs / citations
              live. */}
          {isSsp && sspDocumentId && (
            <Link
              href={`/dashboard/ssp#v-${sspDocumentId}`}
              className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60"
              title="Open in the Codex SSP version detail (drift, sign-offs, citations)"
            >
              View in SSP
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
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
                        className={`${PILL_BASE} ${SIG_STYLES[s.signatureMeaning ?? ""] ?? PILL_TONES.slate}`}
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
