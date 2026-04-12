"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Plus,
  ExternalLink,
  Clock,
  Zap,
  Flag,
  X,
  Check,
  Shield,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type Milestone = {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  orderIndex: number;
};

export type PoamEntry = {
  id: string;
  controlRecordId: string;
  controlId: string;
  controlTitle: string;
  controlFamily: string;
  implementationStatus: string;
  technicalStatus: string;
  policyDocRequired: boolean;
  policyStatus: string;
  status: "open" | "closed";
  weaknessDescription: string | null;
  remediationPlan: string | null;
  scheduledCompletionDate: string | null;
  closedAt: string | null;
  closeoutEvidence: string | null;
  createdAt: string;
  milestones: Milestone[];
  daysOpen: number;
  isOverdue: boolean;
  sprsImpact: number;
  controlNowImplemented: boolean;
  c3paoNote: string | null;
  disposition: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const FAMILY_NAMES: Record<string, string> = {
  AC: "Access Control", AT: "Awareness & Training", AU: "Audit & Accountability",
  CM: "Configuration Mgmt", IA: "Identification & Auth", IR: "Incident Response",
  MA: "Maintenance", MP: "Media Protection", PS: "Personnel Security",
  PE: "Physical Protection", RA: "Risk Assessment", CA: "Security Assessment",
  SC: "System & Comms", SI: "System & Info Integrity",
};

function riskLevel(sprs: number): { label: string; cls: string } {
  if (sprs >= 5) return { label: "Critical", cls: "bg-red-100 text-red-800 border-red-300" };
  if (sprs >= 3) return { label: "High", cls: "bg-orange-100 text-orange-800 border-orange-300" };
  if (sprs >= 1) return { label: "Medium", cls: "bg-amber-100 text-amber-800 border-amber-300" };
  return { label: "Low", cls: "bg-gray-100 text-gray-600 border-gray-200" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDateInput(val: string): string | null {
  return val || null;
}

// ─── Milestone row ──────────────────────────────────────────────────────────

function MilestoneRow({
  milestone,
  entryId,
  onToggle,
}: {
  milestone: Milestone;
  entryId: string;
  onToggle: (entryId: string, milestoneId: string, done: boolean) => void;
}) {
  const done = !!milestone.completedAt;
  const overdue =
    !done && milestone.dueDate && new Date(milestone.dueDate) < new Date();

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <button
        type="button"
        onClick={() => onToggle(entryId, milestone.id, !done)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          done
            ? "border-emerald-500 bg-emerald-500"
            : "border-gray-300 bg-white hover:border-blue-400"
        }`}
        title={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-xs ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
          {milestone.title}
        </span>
        {milestone.dueDate && (
          <span className={`ml-2 text-[10px] font-medium ${
            done ? "text-gray-400" : overdue ? "text-red-600" : "text-gray-400"
          }`}>
            {overdue && !done ? "⚠ " : ""}Due {formatDate(milestone.dueDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Entry card ─────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  expanded,
  onToggleExpand,
  onSave,
  onAddMilestone,
  onToggleMilestone,
  onClose,
  onReopen,
}: {
  entry: PoamEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onSave: (id: string, patch: Partial<Pick<PoamEntry, "weaknessDescription" | "remediationPlan" | "scheduledCompletionDate">>) => Promise<void>;
  onAddMilestone: (entryId: string, title: string, dueDate: string | null) => Promise<void>;
  onToggleMilestone: (entryId: string, milestoneId: string, done: boolean) => void;
  onClose: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
}) {
  const [weakness, setWeakness] = useState(entry.weaknessDescription ?? "");
  const [remediation, setRemediation] = useState(entry.remediationPlan ?? "");
  const [targetDate, setTargetDate] = useState(entry.scheduledCompletionDate ?? "");
  const [saving, setSaving] = useState(false);
  const [milestoneText, setMilestoneText] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [closing, setClosing] = useState(false);
  const milestoneInputRef = useRef<HTMLInputElement>(null);

  const risk = riskLevel(entry.sprsImpact);
  const completedMilestones = entry.milestones.filter((m) => m.completedAt).length;
  const totalMilestones = entry.milestones.length;
  const hasData = !!(entry.weaknessDescription || entry.remediationPlan);
  const isDirty =
    weakness !== (entry.weaknessDescription ?? "") ||
    remediation !== (entry.remediationPlan ?? "") ||
    targetDate !== (entry.scheduledCompletionDate ?? "");

  async function handleSave() {
    setSaving(true);
    await onSave(entry.id, {
      weaknessDescription: weakness || null,
      remediationPlan: remediation || null,
      scheduledCompletionDate: parseDateInput(targetDate),
    });
    setSaving(false);
  }

  async function handleAddMilestone() {
    const title = milestoneText.trim();
    if (!title) return;
    setAddingMilestone(true);
    await onAddMilestone(entry.id, title, parseDateInput(milestoneDue));
    setMilestoneText("");
    setMilestoneDue("");
    setAddingMilestone(false);
  }

  async function handleClose() {
    setClosing(true);
    await onClose(entry.id);
    setClosing(false);
  }

  const cardBorder = entry.status === "closed"
    ? "border-gray-200"
    : entry.isOverdue
    ? "border-red-300"
    : entry.controlNowImplemented
    ? "border-emerald-300"
    : "border-gray-200";

  const cardBg = entry.status === "closed"
    ? "bg-gray-50"
    : entry.isOverdue
    ? "bg-red-50/40"
    : "bg-white";

  return (
    <div className={`rounded-xl border ${cardBorder} ${cardBg} overflow-hidden shadow-sm`}>
      {/* ── Header (always visible) ── */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {/* Chevron */}
        <span className="mt-0.5 shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        {/* Control info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {entry.controlId}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {FAMILY_NAMES[entry.controlFamily] ?? entry.controlFamily}
            </span>
            {entry.status === "closed" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Check className="h-2.5 w-2.5" /> Closed
              </span>
            )}
            {entry.isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <AlertTriangle className="h-2.5 w-2.5" /> Overdue
              </span>
            )}
            {entry.controlNowImplemented && entry.status === "open" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-2.5 w-2.5" /> Control now implemented
              </span>
            )}
          </div>
          <p className={`text-sm font-medium leading-snug ${entry.status === "closed" ? "text-gray-400" : "text-gray-900"}`}>
            {entry.controlTitle}
          </p>
        </div>

        {/* Right-side meta */}
        <div className="shrink-0 flex items-center gap-3 text-right ml-2">
          {entry.sprsImpact > 0 && (
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${risk.cls}`}>
              <Zap className="h-2.5 w-2.5" />
              {entry.sprsImpact} SPRS pt{entry.sprsImpact !== 1 ? "s" : ""}
            </span>
          )}
          {entry.status === "open" && (
            <div className="text-right">
              <p className="text-[10px] font-medium text-gray-400">
                {totalMilestones > 0
                  ? `${completedMilestones}/${totalMilestones} milestones`
                  : "No milestones"}
              </p>
              <p className="text-[10px] text-gray-400">{entry.daysOpen}d open</p>
            </div>
          )}
          {entry.status === "closed" && entry.closedAt && (
            <p className="text-[10px] text-gray-400">
              Closed {formatDate(entry.closedAt)}
            </p>
          )}
        </div>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">

          {/* Control now implemented — suggest close */}
          {entry.controlNowImplemented && entry.status === "open" && (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-emerald-800">
                  This control is now marked "{entry.implementationStatus}" in the SCTM.
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Review the remediation and close this POA&M item when satisfied.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {closing ? "Closing…" : "Close now"}
              </button>
            </div>
          )}

          {/* C3PAO examiner note */}
          {entry.c3paoNote && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 mb-1">
                C3PAO Examiner will ask
              </p>
              <p className="text-xs text-indigo-800 leading-relaxed">{entry.c3paoNote}</p>
            </div>
          )}

          {/* Weakness + Remediation */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Weakness Description
              </label>
              <textarea
                value={weakness}
                onChange={(e) => setWeakness(e.target.value)}
                rows={3}
                disabled={entry.status === "closed"}
                placeholder="Describe the gap or non-compliance…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 resize-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Remediation Plan
              </label>
              <textarea
                value={remediation}
                onChange={(e) => setRemediation(e.target.value)}
                rows={3}
                disabled={entry.status === "closed"}
                placeholder="Steps to resolve this gap…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 resize-none"
              />
            </div>
          </div>

          {/* Target date + Save */}
          {entry.status === "open" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Target Completion
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              {isDirty && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="mt-4 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              )}
              <Link
                href={`/dashboard/controls?control=${entry.controlId}`}
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                View in SCTM <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* ── Milestones ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Milestones
                {totalMilestones > 0 && (
                  <span className={`ml-1.5 font-bold ${
                    completedMilestones === totalMilestones
                      ? "text-emerald-600"
                      : "text-gray-500"
                  }`}>
                    ({completedMilestones}/{totalMilestones})
                  </span>
                )}
              </p>
            </div>

            {totalMilestones === 0 && (
              <p className="text-xs text-amber-600 mb-2">
                ⚠ No milestones — C3PAO examiners expect documented remediation steps.
              </p>
            )}

            <div className="space-y-0.5">
              {entry.milestones.map((m) => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  entryId={entry.id}
                  onToggle={onToggleMilestone}
                />
              ))}
            </div>

            {/* Add milestone */}
            {entry.status === "open" && (
              <div className="mt-2 flex gap-2 flex-wrap">
                <input
                  ref={milestoneInputRef}
                  type="text"
                  value={milestoneText}
                  onChange={(e) => setMilestoneText(e.target.value)}
                  placeholder="Add a milestone…"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddMilestone(); }}
                  className="flex-1 min-w-40 rounded-lg border border-gray-200 px-3 py-1.5 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="date"
                  value={milestoneDue}
                  onChange={(e) => setMilestoneDue(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  disabled={!milestoneText.trim() || addingMilestone}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {addingMilestone ? "Adding…" : "Add"}
                </button>
              </div>
            )}
          </div>

          {/* ── Footer actions ── */}
          {entry.status === "open" && !entry.controlNowImplemented && (
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {closing ? "Closing…" : "Mark as closed"}
              </button>
              <span className="text-[10px] text-gray-400">
                Requires control to be resolved in SCTM first
              </span>
            </div>
          )}

          {entry.status === "closed" && (
            <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
              {entry.closeoutEvidence && (
                <p className="text-xs text-gray-500 flex-1">
                  <strong>Closeout:</strong> {entry.closeoutEvidence}
                </p>
              )}
              <button
                type="button"
                onClick={() => onReopen(entry.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Reopen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  color,
  icon: Icon,
  collapsible,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <div className={`flex items-center gap-2 py-2 ${collapsible ? "cursor-pointer select-none" : ""}`}>
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <span className={`text-sm font-semibold ${color}`}>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        color.includes("red") ? "bg-red-100 text-red-700" :
        color.includes("amber") ? "bg-amber-100 text-amber-700" :
        color.includes("emerald") ? "bg-emerald-100 text-emerald-700" :
        "bg-gray-100 text-gray-600"
      }`}>
        {count}
      </span>
      {collapsible && (
        <span className="ml-auto text-gray-400">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      )}
    </div>
  );

  if (collapsible && onToggle) {
    return (
      <button type="button" onClick={onToggle} className="w-full text-left focus:outline-none">
        {inner}
      </button>
    );
  }
  return inner;
}

// ─── Main tracker ────────────────────────────────────────────────────────────

export function PoamTracker({ initialEntries }: { initialEntries: PoamEntry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<PoamEntry[]>(initialEntries);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue" | "active" | "closed">("all");
  const [syncing, startSync] = useTransition();
  const [closedCollapsed, setClosedCollapsed] = useState(true);

  // ── Summary counts ──
  const open = entries.filter((e) => e.status === "open");
  const closed = entries.filter((e) => e.status === "closed");
  const overdue = open.filter((e) => e.isOverdue);
  const noMilestones = open.filter((e) => e.milestones.length === 0);
  const readyToClose = open.filter((e) => e.controlNowImplemented);
  const totalSprsAtRisk = open.reduce((sum, e) => sum + e.sprsImpact, 0);

  // ── Sections ──
  const overdueEntries = open.filter((e) => e.isOverdue);
  const readyEntries = open.filter((e) => !e.isOverdue && e.controlNowImplemented);
  const activeEntries = open.filter((e) => !e.isOverdue && !e.controlNowImplemented && (e.weaknessDescription || e.remediationPlan || e.milestones.length > 0));
  const needsSetupEntries = open.filter((e) => !e.isOverdue && !e.controlNowImplemented && !e.weaknessDescription && !e.remediationPlan && e.milestones.length === 0);

  // Apply top-level filter
  const showOverdue = filter === "all" || filter === "overdue";
  const showActive = filter === "all" || filter === "active";
  const showClosed = filter === "all" || filter === "closed";

  // ── Mutations ──

  async function handleSave(id: string, patch: Partial<Pick<PoamEntry, "weaknessDescription" | "remediationPlan" | "scheduledCompletionDate">>) {
    const res = await fetch(`/api/poam/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function handleAddMilestone(entryId: string, title: string, dueDate: string | null) {
    const res = await fetch(`/api/poam/entries/${entryId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate }),
    });
    if (!res.ok) return;
    const milestone: Milestone = await res.json();
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, milestones: [...e.milestones, milestone] } : e
      )
    );
  }

  function handleToggleMilestone(entryId: string, milestoneId: string, done: boolean) {
    const completedAt = done ? new Date().toISOString() : null;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              milestones: e.milestones.map((m) =>
                m.id === milestoneId ? { ...m, completedAt } : m
              ),
            }
          : e
      )
    );
    fetch(`/api/poam/entries/${entryId}/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt }),
    });
  }

  async function handleClose(id: string) {
    const res = await fetch(`/api/poam/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (!res.ok) return;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: "closed", closedAt: new Date().toISOString() } : e
      )
    );
    setExpandedId(null);
  }

  async function handleReopen(id: string) {
    const res = await fetch(`/api/poam/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });
    if (!res.ok) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "open", closedAt: null } : e))
    );
  }

  function handleSync() {
    startSync(async () => {
      await fetch("/api/poam/entries/sync-from-controls", { method: "POST" });
      router.refresh();
    });
  }

  const entryProps = {
    onSave: handleSave,
    onAddMilestone: handleAddMilestone,
    onToggleMilestone: handleToggleMilestone,
    onClose: handleClose,
    onReopen: handleReopen,
  };

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">POA&M Tracker</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Plan of Action & Milestones — auto-generated from SCTM gaps.
              {totalSprsAtRisk > 0 && (
                <span className="ml-2 font-semibold text-red-600">
                  {totalSprsAtRisk} SPRS pts at risk.
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from SCTM"}
          </button>
        </div>

        {/* ── Summary chips ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Open", value: open.length, color: "text-gray-900", bg: "bg-white border-gray-200" },
            { label: "Overdue", value: overdue.length, color: "text-red-700", bg: overdue.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200" },
            { label: "No Milestones", value: noMilestones.length, color: noMilestones.length > 0 ? "text-amber-700" : "text-gray-500", bg: noMilestones.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200" },
            { label: "Closed", value: closed.length, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${bg}`}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className={`text-xs font-medium ${color} opacity-75`}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Overdue alert ── */}
        {overdue.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">
                {overdue.length} POA&M item{overdue.length !== 1 ? "s" : ""} past their target date.
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                Overdue items without milestone progress are flagged as findings by C3PAO examiners.
                Update the target date or add a milestone to show active remediation.
              </p>
            </div>
          </div>
        )}

        {/* ── Filter chips ── */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "overdue", "active", "closed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none ${
                filter === f
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "All" : f === "overdue" ? "Overdue" : f === "active" ? "Active" : "Closed"}
            </button>
          ))}
        </div>

        {/* ── Empty state ── */}
        {entries.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
            <Shield className="mx-auto h-10 w-10 text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No open POA&M items</p>
            <p className="text-xs text-gray-500 mt-1">All controls are implemented or not applicable.</p>
          </div>
        )}

        {/* ── Ready to close ── */}
        {showActive && readyEntries.length > 0 && (
          <div className="space-y-2">
            <SectionHeader label="Ready to Close" count={readyEntries.length} color="text-emerald-700" icon={CheckCircle2} />
            <div className="space-y-2">
              {readyEntries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  expanded={expandedId === e.id}
                  onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  {...entryProps}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Overdue ── */}
        {showOverdue && overdueEntries.length > 0 && (
          <div className="space-y-2">
            <SectionHeader label="Overdue" count={overdueEntries.length} color="text-red-700" icon={AlertTriangle} />
            <div className="space-y-2">
              {overdueEntries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  expanded={expandedId === e.id}
                  onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  {...entryProps}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Active / In Progress ── */}
        {showActive && activeEntries.length > 0 && (
          <div className="space-y-2">
            <SectionHeader label="In Progress" count={activeEntries.length} color="text-blue-700" icon={Clock} />
            <div className="space-y-2">
              {activeEntries
                .sort((a, b) => b.sprsImpact - a.sprsImpact || b.daysOpen - a.daysOpen)
                .map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    expanded={expandedId === e.id}
                    onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    {...entryProps}
                  />
                ))}
            </div>
          </div>
        )}

        {/* ── Needs setup ── */}
        {showActive && needsSetupEntries.length > 0 && (
          <div className="space-y-2">
            <SectionHeader label="Needs Documentation" count={needsSetupEntries.length} color="text-amber-700" icon={Flag} />
            <p className="text-xs text-gray-500">
              These controls were auto-created from SCTM gaps. Add a weakness description and milestones.
            </p>
            <div className="space-y-2">
              {needsSetupEntries
                .sort((a, b) => b.sprsImpact - a.sprsImpact)
                .map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    expanded={expandedId === e.id}
                    onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    {...entryProps}
                  />
                ))}
            </div>
          </div>
        )}

        {/* ── Closed ── */}
        {showClosed && closed.length > 0 && (
          <div className="space-y-2">
            <SectionHeader
              label="Closed"
              count={closed.length}
              color="text-emerald-700"
              icon={CheckCircle2}
              collapsible
              collapsed={closedCollapsed}
              onToggle={() => setClosedCollapsed((v) => !v)}
            />
            {!closedCollapsed && (
              <div className="space-y-2">
                {closed
                  .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
                  .map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      expanded={expandedId === e.id}
                      onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                      {...entryProps}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ── C3PAO methodology note ── */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
          <p className="text-xs font-semibold text-gray-700 mb-1">CMMC POA&M Requirements</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            Under DFARS 252.204-7012 and NIST SP 800-171, a POA&M documents how and when
            identified gaps will be resolved. Each open item must have a weakness description,
            remediation plan, and at least one milestone with a target date. C3PAO examiners
            will verify that milestones are being actively worked and dates are realistic.
          </p>
        </div>
      </div>
    </div>
  );
}
