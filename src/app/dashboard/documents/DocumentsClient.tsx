"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  Calendar,
  PlusCircle,
  X,
} from "lucide-react";
import { ManifestBundleUploadModal } from "./ManifestBundleUploadModal";

// ── Types ────────────────────────────────────────────────────────────────────

interface GovDoc {
  id: string;
  docId: string;
  title: string;
  type: string | null;
  domain: string | null;
  version: string | null;
  status: string;
  approvalDate: string | null;
  nextReviewDate: string | null;
}

interface DocLink {
  docCode: string;
  controlId: string;
}

interface ManifestRun {
  runId: string;
  ingestedAt: string;
  docCount: number | null;
  bundleSource: string | null;
}

interface Props {
  initialDocs: GovDoc[];
  docLinks: DocLink[];
  runs: ManifestRun[];
  allGovControlIds: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "Policy", label: "Policy" },
  { value: "Procedure", label: "Procedure / SOP" },
  { value: "Plan", label: "Plan" },
  { value: "Standard", label: "Standard" },
  { value: "Work Instruction", label: "Work Instruction" },
  { value: "Other", label: "Other" },
];

const DOC_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted for review" },
  { value: "APPROVED", label: "Approved" },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  SUBMITTED: { label: "Submitted", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  RETIRED: { label: "Retired", cls: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500" },
  DRAFT: { label: "Draft", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addYearIso(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return todayIso();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  docId: "",
  title: "",
  type: "Policy",
  version: "1.0",
  status: "DRAFT",
  controlIds: [] as string[],
  signedDate: todayIso(),
  nextReviewDate: addYearIso(todayIso()),
  nextReviewEdited: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diffDays < 90 && diffDays > 0;
}

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

/**
 * Derive a Next Review date: explicit value wins; otherwise default to one year
 * after the approval (signed) date. Returns null when neither is known.
 */
function effectiveNextReview(doc: Pick<GovDoc, "nextReviewDate" | "approvalDate">): string | null {
  if (doc.nextReviewDate) return doc.nextReviewDate;
  if (!doc.approvalDate) return null;
  const signed = new Date(doc.approvalDate);
  if (Number.isNaN(signed.getTime())) return null;
  signed.setFullYear(signed.getFullYear() + 1);
  return signed.toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ── Add Document Form ────────────────────────────────────────────────────────

function AddDocumentForm({
  allGovControlIds,
  onAdded,
  onClose,
}: {
  allGovControlIds: string[];
  onAdded: (doc: GovDoc) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctrlInput, setCtrlInput] = useState("");

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
  const labelClass = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

  const addControl = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || form.controlIds.includes(trimmed)) return;
    setForm((f) => ({ ...f, controlIds: [...f.controlIds, trimmed] }));
    setCtrlInput("");
  };

  const removeControl = (id: string) => {
    setForm((f) => ({ ...f, controlIds: f.controlIds.filter((c) => c !== id) }));
  };

  const handleSubmit = async () => {
    if (!form.docId.trim()) { setError("Document ID is required (e.g. POL-AC-001)."); return; }
    if (!form.title.trim()) { setError("Document title is required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/governance/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: form.docId.trim(),
          title: form.title.trim(),
          type: form.type,
          version: form.version,
          status: form.status,
          approvalDate: form.signedDate || null,
          nextReviewDate: form.nextReviewDate || null,
          controlIds: form.controlIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save document."); return; }
      onAdded(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered suggestions
  const suggestions = ctrlInput.length >= 3
    ? allGovControlIds.filter((id) => id.includes(ctrlInput) && !form.controlIds.includes(id)).slice(0, 8)
    : [];

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/30 bg-white p-5 shadow-md dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add Document Manually</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Document ID *</label>
          <input
            type="text"
            value={form.docId}
            onChange={(e) => setForm({ ...form, docId: e.target.value })}
            placeholder="e.g. POL-AC-001"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400">Use your org&apos;s naming convention (e.g. POL-AC-001, SOP-AT-002)</p>
        </div>
        <div>
          <label className={labelClass}>Document type *</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Access Control Policy"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Version</label>
          <input
            type="text"
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
            placeholder="1.0"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
            {DOC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className={labelClass}>Signed / approval date</label>
          <input
            type="date"
            value={form.signedDate}
            onChange={(e) => {
              const next = e.target.value;
              setForm((prev) => ({
                ...prev,
                signedDate: next,
                nextReviewDate: prev.nextReviewEdited
                  ? prev.nextReviewDate
                  : next
                  ? addYearIso(next)
                  : prev.nextReviewDate,
              }));
            }}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400">Next review auto-fills to one year after the signed date.</p>
        </div>
        <div>
          <label className={labelClass}>Next review date</label>
          <input
            type="date"
            value={form.nextReviewDate}
            onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value, nextReviewEdited: true })}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Map to controls (optional)</label>
          <div className="relative">
            <input
              type="text"
              value={ctrlInput}
              onChange={(e) => setCtrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addControl(ctrlInput); } }}
              placeholder="Type e.g. 3.1 to search…"
              className={inputClass}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {suggestions.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => addControl(id)}
                    className="block w-full px-3 py-1.5 text-left font-mono text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>
          {form.controlIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {form.controlIds.map((id) => (
                <span key={id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {id}
                  <button type="button" onClick={() => removeControl(id)} className="text-gray-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save document"}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DocumentsClient({ initialDocs, docLinks, runs, allGovControlIds }: Props) {
  const [docs, setDocs] = useState<GovDoc[]>(initialDocs);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const router = useRouter();

  const handleDocAdded = (doc: GovDoc) => {
    setDocs((prev) => [...prev, doc].sort((a, b) => a.docId.localeCompare(b.docId)));
    setShowAddForm(false);
    router.refresh();
  };

  // Build doc → controls map
  const docControlMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const link of docLinks) {
      if (!m.has(link.docCode)) m.set(link.docCode, new Set());
      m.get(link.docCode)!.add(link.controlId);
    }
    return m;
  }, [docLinks]);

  // Build control → docs map
  const controlDocMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const link of docLinks) {
      if (!m.has(link.controlId)) m.set(link.controlId, new Set());
      m.get(link.controlId)!.add(link.docCode);
    }
    return m;
  }, [docLinks]);

  const approvedDocIds = useMemo(
    () => new Set(docs.filter((d) => d.status !== "DRAFT").map((d) => d.docId)),
    [docs]
  );

  const gapControls = useMemo(
    () =>
      allGovControlIds.filter((id) => {
        const mapped = controlDocMap.get(id);
        if (!mapped || mapped.size === 0) return true;
        return ![...mapped].some((code) => approvedDocIds.has(code));
      }),
    [allGovControlIds, controlDocMap, approvedDocIds]
  );

  const latestRun = runs[0] ?? null;
  const approvedCount = docs.filter((d) => d.status === "APPROVED").length;
  const submittedCount = docs.filter((d) => d.status === "SUBMITTED").length;
  const draftCount = docs.filter((d) => d.status === "DRAFT").length;
  const reviewOverdue = docs.filter((d) => isOverdue(effectiveNextReview(d)));
  const reviewSoon = docs.filter((d) => !isOverdue(effectiveNextReview(d)) && isExpiringSoon(effectiveNextReview(d)));

  const card = "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-gray-900)]">Governance Documents</h1>
            <p className="mt-0.5 text-sm text-[var(--color-gray-500)]">
              Policies, procedures, and plans that satisfy governance compliance controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAddForm((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
            >
              <PlusCircle className="h-4 w-4" />
              Add manually
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Upload className="h-4 w-4" />
              Upload manifest bundle
            </button>
          </div>
        </div>

        {/* ── Manual add form ── */}
        {showAddForm && (
          <AddDocumentForm
            allGovControlIds={allGovControlIds}
            onAdded={handleDocAdded}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* ── No docs state ── */}
        {docs.length === 0 && !showAddForm && (
          <section className={`${card} p-8 text-center`}>
            <Package className="mx-auto h-10 w-10 text-[var(--color-gray-300)]" />
            <h2 className="mt-3 text-sm font-semibold text-[var(--color-gray-700)]">
              No governance documents yet
            </h2>
            <p className="mt-1 text-sm text-[var(--color-gray-500)]">
              Add documents manually or upload a MacTech governance manifest bundle.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
              >
                <PlusCircle className="h-4 w-4" />
                Add document manually
              </button>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                <Upload className="h-4 w-4" />
                Upload manifest bundle
              </button>
            </div>
            <p className="mt-4 text-xs text-[var(--color-gray-400)]">
              MacTech CUI Vault customers: use the manifest bundle upload for automatic document registration and control mapping.
            </p>
          </section>
        )}

        {docs.length > 0 && (
          <>
            {/* ── Stats row ── */}
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

            {/* ── Latest ingest runs (MacTech bundle section) ── */}
            {latestRun && (
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">MacTech manifest ingest history</h2>
                    <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                      Documents registered automatically from MacTech governance bundle uploads.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Re-ingest bundle
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {runs.map((run) => (
                    <div
                      key={run.runId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5"
                    >
                      <div>
                        <span className="font-mono text-xs font-semibold text-[var(--color-gray-800)]">{run.runId}</span>
                        {run.bundleSource && (
                          <span className="ml-2 text-xs text-[var(--color-gray-400)]">{run.bundleSource}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-gray-500)]">
                        <span>{run.docCount ?? 0} docs</span>
                        <span>
                          {new Date(run.ingestedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Review alerts ── */}
            {(reviewOverdue.length > 0 || reviewSoon.length > 0) && (
              <section className={`${card} p-5`}>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-gray-900)]">Review alerts</h2>
                <div className="space-y-2">
                  {reviewOverdue.map((doc) => (
                    <div
                      key={doc.docId}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-800/40 dark:bg-red-950/20"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      <span className="font-mono text-xs font-semibold text-red-700 dark:text-red-400">{doc.docId}</span>
                      <span className="text-xs text-red-700 dark:text-red-400">{doc.title}</span>
                      <span className="ml-auto text-xs text-red-600">Review overdue — {effectiveNextReview(doc)}</span>
                    </div>
                  ))}
                  {reviewSoon.map((doc) => (
                    <div
                      key={doc.docId}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-700/40 dark:bg-amber-950/20"
                    >
                      <Calendar className="h-4 w-4 shrink-0 text-amber-500" />
                      <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">{doc.docId}</span>
                      <span className="text-xs text-amber-700 dark:text-amber-400">{doc.title}</span>
                      <span className="ml-auto text-xs text-amber-600">Review due — {effectiveNextReview(doc)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Document library ── */}
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
                        <th
                          key={h}
                          className="py-3 px-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {docs.map((doc) => {
                      const controls = [...(docControlMap.get(doc.docId) ?? [])];
                      const nextReview = effectiveNextReview(doc);
                      const overdue = isOverdue(nextReview);
                      const soon = isExpiringSoon(nextReview);
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
                            <span className="text-xs text-[var(--color-gray-500)]">{doc.type ?? "—"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-[var(--color-gray-400)]">v{doc.version ?? "1"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={doc.status} />
                          </td>
                          <td className="py-3 px-4">
                            {controls.length === 0 ? (
                              <span className="text-xs italic text-[var(--color-gray-400)]">none mapped</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {controls.slice(0, 4).map((id) => (
                                  <Link
                                    key={id}
                                    href={`/dashboard/controls?control=${id}`}
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
                            {nextReview ? (
                              <span
                                className={`text-xs ${
                                  overdue
                                    ? "font-semibold text-red-600"
                                    : soon
                                    ? "font-semibold text-amber-600"
                                    : "text-[var(--color-gray-400)]"
                                }`}
                                title={!doc.nextReviewDate ? "Auto-calculated: 1 year from approval date" : undefined}
                              >
                                {overdue && <AlertCircle className="mr-1 inline h-3 w-3" />}
                                {nextReview}
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

            {/* ── Coverage gaps ── */}
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
                  These governance controls have no approved document mapped. Add documents manually or re-ingest a bundle with updated mappings.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gapControls.map((id) => (
                    <Link
                      key={id}
                      href={`/dashboard/controls?control=${id}`}
                      className="rounded bg-amber-50 px-2 py-1 font-mono text-xs font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
                    >
                      {id}
                    </Link>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add document manually
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-300"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Re-ingest governance bundle
                  </button>
                </div>
              </section>
            )}
          </>
        )}

      </div>
      {showUploadModal && <ManifestBundleUploadModal onClose={() => setShowUploadModal(false)} />}
    </div>
  );
}
