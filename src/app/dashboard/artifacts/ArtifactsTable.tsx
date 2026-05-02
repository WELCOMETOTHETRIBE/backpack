"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen } from "lucide-react";
import { AttestationReceiptModal } from "@/components/adjudication/AttestationReceiptModal";

export type ArtifactRow = {
  id: string;
  label: string;
  status: string;
  controlId: string;
  controlTitle: string;
  family: string;
  expectedClosureType: string | null;
  expectedEvidenceType: string | null;
  expectedCadence: string | null;
  expectedDueDate: string | null;
  fileName: string | null;
  fileSize: number | null;
  version: string | null;
  uploadedAt: string;
  linkCounts: {
    control: number;
    register_entry: number;
    poam_entry: number;
    poam_milestone: number;
  };
  /** When this artifact is a register pointer whose register is satisfied. */
  coveredByRegister?: string | null;
  coverageReason?: "populated" | "event_driven_empty" | null;
  /**
   * True when this artifact's backing control is inherited or
   * not_applicable for the org. The row stays visible for traceability
   * but reads as N/A and is excluded from outstanding counts.
   */
  controlNotApplicable?: boolean;
  /** Raw implementationStatus of the backing control (for the N/A tooltip). */
  controlImplementationStatus?: string | null;
  /**
   * True for synthetic rows backed by a signed attestation (governance
   * artifact completion), not a real artifact upload. The View link
   * routes to the control detail page instead of /artifacts/[id] because
   * there's no artifact record to view.
   */
  isAttestation?: boolean;
};

const FAMILIES = [
  "AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP",
  "PS", "PE", "RA", "CA", "SC", "SI",
];

const FAMILY_LABELS: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness & Training",
  AU: "Audit & Accountability",
  CM: "Configuration Management",
  IA: "Identification & Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PS: "Personnel Security",
  PE: "Physical Protection",
  RA: "Risk Assessment",
  CA: "Security Assessment",
  SC: "System & Communications Protection",
  SI: "System & Information Integrity",
};

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "awaiting_upload", label: "Awaiting upload" },
  { value: "uploaded", label: "Uploaded" },
  { value: "approved", label: "Approved" },
  { value: "superseded", label: "Superseded" },
  { value: "expired", label: "Expired" },
];

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    awaiting_upload: "bg-amber-100 text-amber-800 border-amber-300",
    uploaded: "bg-sky-100 text-sky-800 border-sky-300",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
    superseded: "bg-gray-100 text-gray-700 border-gray-300",
    expired: "bg-red-100 text-red-800 border-red-300",
  };
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${
        cls[status] ?? "bg-gray-100 text-gray-800 border-gray-300"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function LinkBadges({
  counts,
}: {
  counts: ArtifactRow["linkCounts"];
}) {
  const items = [
    { k: "C", label: "control", n: counts.control, color: "bg-indigo-100 text-indigo-700" },
    { k: "R", label: "register", n: counts.register_entry, color: "bg-teal-100 text-teal-700" },
    { k: "P", label: "POAM", n: counts.poam_entry + counts.poam_milestone, color: "bg-purple-100 text-purple-700" },
  ];
  return (
    <div className="flex gap-1">
      {items.map((i) => (
        <span
          key={i.k}
          title={`${i.n} ${i.label} link${i.n === 1 ? "" : "s"}`}
          className={`inline-flex min-w-[2rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${
            i.n > 0 ? i.color : "bg-gray-100 text-gray-400"
          }`}
        >
          {i.k}·{i.n}
        </span>
      ))}
    </div>
  );
}

function NotApplicablePill({ reason }: { reason?: string | null }) {
  const label = reason === "inherited" ? "N/A · inherited" : "N/A";
  return (
    <span
      className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
      title="Backing control is inherited or not applicable for this org"
    >
      {label}
    </span>
  );
}

function ArtifactTableRow({
  r,
  onOpenAttestation,
}: {
  r: ArtifactRow;
  onOpenAttestation: (completionId: string) => void;
}) {
  const dimmed = r.controlNotApplicable ? "opacity-70 italic" : "";
  // For attestation rows the id is prefixed "att:<completionId>" -- strip
  // the prefix before opening the receipt modal.
  const completionId = r.isAttestation ? r.id.replace(/^att:/, "") : null;
  return (
    <tr className={`border-b border-[var(--color-border)] last:border-none hover:bg-[var(--color-surface-muted)] ${dimmed}`}>
      <td className="px-3 py-2 font-medium">
        <span className="flex items-center gap-1.5">
          {r.isAttestation && (
            <span
              className="inline-flex shrink-0 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
              title="Signed attestation -- one-time architectural declaration"
            >
              SIGNED
            </span>
          )}
          {r.label}
        </span>
      </td>
      <td className="px-3 py-2 text-[var(--color-text-muted)]">{r.controlId}</td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{r.expectedClosureType ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{r.expectedCadence ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
        {r.controlNotApplicable ? "—" : (r.expectedDueDate ?? "—")}
      </td>
      <td className="px-3 py-2">
        {r.controlNotApplicable
          ? <NotApplicablePill reason={r.controlImplementationStatus} />
          : <StatusPill status={r.status} />}
      </td>
      <td className="px-3 py-2"><LinkBadges counts={r.linkCounts} /></td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
        {r.isAttestation
          ? <span className="italic">signed declaration</span>
          : r.fileName ? `${r.fileName} · ${formatSize(r.fileSize)}` : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        {completionId ? (
          <button
            type="button"
            onClick={() => onOpenAttestation(completionId)}
            className="text-sm font-medium text-sky-600 hover:underline"
          >
            View
          </button>
        ) : (
          <Link
            href={`/dashboard/artifacts/${r.id}`}
            className="text-sm font-medium text-sky-600 hover:underline"
          >
            View
          </Link>
        )}
      </td>
    </tr>
  );
}

function FamilyTable({
  rows,
  onOpenAttestation,
}: {
  rows: ArtifactRow[];
  onOpenAttestation: (completionId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-sm">
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Control</th>
            <th className="px-3 py-2">Closure</th>
            <th className="px-3 py-2">Cadence</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Links</th>
            <th className="px-3 py-2">File</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ArtifactTableRow key={r.id} r={r} onOpenAttestation={onOpenAttestation} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FamilySection({
  family,
  rows,
  defaultExpanded,
  onOpenAttestation,
}: {
  family: string;
  rows: ArtifactRow[];
  defaultExpanded: boolean;
  onOpenAttestation: (completionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // N/A rows don't count toward awaiting/approved — no active obligation.
  const active = rows.filter((r) => !r.controlNotApplicable);
  const awaiting = active.filter((r) => r.status === "awaiting_upload").length;
  const approved = active.filter((r) => r.status === "approved").length;
  const naCount = rows.length - active.length;
  const title = FAMILY_LABELS[family] ?? family;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <FolderOpen className="h-5 w-5 shrink-0 text-indigo-600" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
              {family}
            </span>
            <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
            <span className="text-xs text-slate-500">({rows.length})</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {awaiting > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 font-semibold text-amber-800">
              {awaiting} awaiting
            </span>
          )}
          {approved > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 font-semibold text-emerald-800">
              {approved} approved
            </span>
          )}
          {naCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
              {naCount} N/A
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 p-3">
          <FamilyTable rows={rows} onOpenAttestation={onOpenAttestation} />
        </div>
      )}
    </div>
  );
}

type DueWindow = "30d" | "90d" | "all";
const DUE_WINDOW_DAYS: Record<DueWindow, number | null> = {
  "30d": 30,
  "90d": 90,
  all: null,
};

export function ArtifactsTable({ rows }: { rows: ArtifactRow[] }) {
  const [status, setStatus] = useState("");
  const [family, setFamily] = useState("");
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [openAttestationId, setOpenAttestationId] = useState<string | null>(null);
  // Default to a 30-day due window so the page opens as a focused weekly
  // punch-list rather than a wall of every artifact obligation. The "All"
  // chip escapes the window if the user wants the full library. Approved
  // and signed-attestation rows always stay visible regardless of window
  // -- they're history, not work.
  const [dueWindow, setDueWindow] = useState<DueWindow>("30d");

  const filtered = useMemo(() => {
    const windowDays = DUE_WINDOW_DAYS[dueWindow];
    const now = Date.now();
    const cutoff = windowDays === null ? null : now + windowDays * 24 * 3600 * 1000;
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (family && r.family !== family) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.label.toLowerCase().includes(q) &&
          !r.controlId.toLowerCase().includes(q) &&
          !(r.controlTitle ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      // Due-window filter: keep approved + attestation rows always (they're
      // satisfied, not work). For everything else, keep rows whose due date
      // falls inside the window. Rows with no due date and a non-final
      // status get hidden in narrow windows -- they have no urgency signal.
      if (cutoff !== null) {
        if (r.status === "approved" || r.isAttestation) return true;
        if (!r.expectedDueDate) return false;
        const due = new Date(r.expectedDueDate).getTime();
        if (Number.isNaN(due) || due > cutoff) return false;
      }
      return true;
    });
  }, [rows, status, family, search, dueWindow]);

  const byFamily = useMemo(() => {
    const groups = new Map<string, ArtifactRow[]>();
    for (const r of filtered) {
      const key = r.family || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.controlId.localeCompare(b.controlId) || a.label.localeCompare(b.label));
    }
    return FAMILIES
      .filter((f) => groups.has(f))
      .map((f) => ({ family: f, rows: groups.get(f)! }))
      .concat(
        [...groups.keys()]
          .filter((k) => !FAMILIES.includes(k))
          .map((k) => ({ family: k, rows: groups.get(k)! }))
      );
  }, [filtered]);

  const dueWindowLabel = dueWindow === "all"
    ? `Showing all ${rows.length}`
    : `Showing ${filtered.length} of ${rows.length} due in next ${dueWindow === "30d" ? "30" : "90"} days (plus approved)`;

  return (
    <div className="space-y-3">
      {/* Due-window chip selector. Default 30d so the page opens as a
          weekly punch-list, not a wall of every artifact obligation. */}
      <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs">
        <span className="font-medium text-indigo-900">Due window:</span>
        <div className="flex items-center gap-0.5 rounded border border-indigo-200 bg-white p-0.5">
          {(["30d", "90d", "all"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDueWindow(w)}
              className={`rounded px-2 py-0.5 font-semibold transition-colors ${dueWindow === w ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {w === "30d" ? "Next 30 days" : w === "90d" ? "Next 90 days" : "All"}
            </button>
          ))}
        </div>
        <span className="text-slate-600">{dueWindowLabel}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search label or control…"
          className="flex-1 min-w-[200px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">All families</option>
          {FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f} — {FAMILY_LABELS[f] ?? f}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setGrouped(true)}
            className={`rounded px-2 py-1.5 transition-colors ${grouped ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            By family
          </button>
          <button
            type="button"
            onClick={() => setGrouped(false)}
            className={`rounded px-2 py-1.5 transition-colors ${!grouped ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Flat list
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-12 text-center text-[var(--color-text-muted)]">
          {rows.length === 0
            ? "No artifacts yet. Placeholders appear here when onboarding completes."
            : "No artifacts match these filters."}
        </div>
      ) : grouped ? (
        <div className="space-y-3">
          {byFamily.map(({ family: f, rows: fRows }) => (
            <FamilySection
              key={f}
              family={f}
              rows={fRows}
              defaultExpanded={byFamily.length <= 3 || fRows.some((r) => r.status === "awaiting_upload")}
              onOpenAttestation={setOpenAttestationId}
            />
          ))}
        </div>
      ) : (
        <FamilyTable rows={filtered} onOpenAttestation={setOpenAttestationId} />
      )}

      <div className="text-xs text-[var(--color-text-muted)]">
        Showing {filtered.length} of {rows.length} artifact
        {rows.length === 1 ? "" : "s"}.
      </div>

      {openAttestationId && (
        <AttestationReceiptModal
          completionId={openAttestationId}
          onClose={() => setOpenAttestationId(null)}
        />
      )}
    </div>
  );
}
