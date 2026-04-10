"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Filter, ChevronRight, AlertTriangle } from "lucide-react";

export type AssessorControl = {
  controlId: string;
  title: string | null;
  implementationStatus: string;
  narrativePreview: string;
  evidenceCount: number;
  hasOpenPoam: boolean;
  family: string; // "3.1", "3.2", etc.
};

const FAMILY_NAMES: Record<string, string> = {
  "3.1": "Access Control",
  "3.2": "Awareness & Training",
  "3.3": "Audit & Accountability",
  "3.4": "Configuration Management",
  "3.5": "Identification & Authentication",
  "3.6": "Incident Response",
  "3.7": "Maintenance",
  "3.8": "Media Protection",
  "3.9": "Personnel Security",
  "3.10": "Physical Protection",
  "3.11": "Risk Assessment",
  "3.12": "Security Assessment",
  "3.13": "System & Comms Protection",
  "3.14": "System & Info Integrity",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-600", label: "Not Started" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", label: "In Progress" },
  implemented: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Implemented" },
  assessed: { bg: "bg-violet-100", text: "text-violet-700", label: "Assessed" },
  inherited: { bg: "bg-teal-100", text: "text-teal-700", label: "Inherited" },
  not_applicable: { bg: "bg-slate-100", text: "text-slate-600", label: "N/A" },
};

const ALL_FAMILIES = Object.keys(FAMILY_NAMES);
const ALL_STATUSES = ["not_started", "in_progress", "implemented", "assessed", "inherited", "not_applicable"];

export function AssessorControlsClient({ controls }: { controls: AssessorControl[] }) {
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return controls.filter((c) => {
      if (familyFilter !== "all" && c.family !== familyFilter) return false;
      if (statusFilter !== "all" && c.implementationStatus !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !c.controlId.toLowerCase().includes(q) &&
          !(c.title ?? "").toLowerCase().includes(q) &&
          !c.narrativePreview.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [controls, query, familyFilter, statusFilter]);

  // Group filtered by family
  const grouped = useMemo(() => {
    const map = new Map<string, AssessorControl[]>();
    for (const c of filtered) {
      const list = map.get(c.family) ?? [];
      list.push(c);
      map.set(c.family, list);
    }
    return map;
  }, [filtered]);

  const totalImplemented = controls.filter(
    (c) => ["implemented", "assessed", "inherited"].includes(c.implementationStatus)
  ).length;

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--color-gray-600)]">
        <span>
          <span className="font-semibold text-[var(--color-navy-primary)]">{totalImplemented}</span> / {controls.length} implemented or inherited
        </span>
        <span className="text-[var(--color-gray-300)]">·</span>
        <span>
          <span className="font-semibold text-[var(--color-navy-primary)]">{filtered.length}</span> shown
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-gray-400)]" />
          <input
            type="search"
            placeholder="Search by ID or keyword…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-navy-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-primary)]/10"
          />
        </div>

        {/* Family filter */}
        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-gray-400)]" />
          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-white py-2 pl-8 pr-8 text-sm text-[var(--color-gray-700)] focus:border-[var(--color-navy-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-primary)]/10 appearance-none"
          >
            <option value="all">All families</option>
            {ALL_FAMILIES.map((f) => (
              <option key={f} value={f}>{f} — {FAMILY_NAMES[f]}</option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-700)] focus:border-[var(--color-navy-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-primary)]/10 appearance-none"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_STYLES[s]?.label ?? s}</option>
          ))}
        </select>
      </div>

      {/* Control list grouped by family */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-gray-500)]">
          No controls match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {ALL_FAMILIES.filter((f) => grouped.has(f)).map((family) => {
            const familyControls = grouped.get(family)!;
            const familyDone = familyControls.filter((c) =>
              ["implemented", "assessed", "inherited"].includes(c.implementationStatus)
            ).length;
            return (
              <section key={family}>
                <div className="mb-2 flex items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">
                    <span className="font-mono text-[var(--color-gray-400)] mr-1.5">{family}</span>
                    {FAMILY_NAMES[family]}
                  </h2>
                  <span className="text-xs text-[var(--color-gray-400)]">
                    {familyDone}/{familyControls.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border)]">
                  {familyControls.map((ctrl) => {
                    const style = STATUS_STYLES[ctrl.implementationStatus] ?? STATUS_STYLES["not_started"]!;
                    return (
                      <Link
                        key={ctrl.controlId}
                        href={`/assessor/controls/${ctrl.controlId}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-gray-50)] transition-colors group"
                      >
                        <span className="w-14 shrink-0 font-mono text-xs font-semibold text-[var(--color-navy-primary)]">
                          {ctrl.controlId}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--color-gray-800)]">
                            {ctrl.title ?? ctrl.controlId}
                          </p>
                          {ctrl.narrativePreview && (
                            <p className="mt-0.5 truncate text-xs text-[var(--color-gray-500)]">
                              {ctrl.narrativePreview}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {ctrl.hasOpenPoam && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Open POA&M item" />
                          )}
                          {ctrl.evidenceCount > 0 && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                              {ctrl.evidenceCount} ev.
                            </span>
                          )}
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                          <ChevronRight className="h-4 w-4 text-[var(--color-gray-300)] group-hover:text-[var(--color-gray-400)]" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
