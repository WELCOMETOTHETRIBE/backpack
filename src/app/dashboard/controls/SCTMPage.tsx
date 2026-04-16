"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, LayoutList, LayoutGrid, Layers, Sparkles, ChevronDown, ArrowLeft } from "lucide-react";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES, getControlFamilyPrefix } from "@/components/governance-wizard/constants";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { type SCTMRecord } from "./SCTMFilters";
import { SCTMControlDetail, type NistRow } from "./SCTMControlDetail";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getOptimizedByControlId } from "@/lib/sctm-optimized-types";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

/** Get color classes based on implementation percentage — 5-tier spectrum */
function getPercentageColors(pct: number, isActive: boolean): {
  bg: string;
  bgActive: string;
  border: string;
  borderActive: string;
  text: string;
  textActive: string;
  icon: string;
  iconActive: string;
  progress: string;
  progressActive: string;
} {
  if (pct === 100) {
    // 100% — muted teal (fully adjudicated)
    return {
      bg: "bg-teal-50",
      bgActive: "bg-teal-700",
      border: "border-teal-200",
      borderActive: "border-teal-700",
      text: "text-teal-700",
      textActive: "text-white",
      icon: "bg-teal-100 text-teal-600",
      iconActive: "bg-white/20",
      progress: "bg-teal-500",
      progressActive: "bg-white/70",
    };
  } else if (pct >= 67) {
    // 67-99% — slate blue (strong progress)
    return {
      bg: "bg-sky-50",
      bgActive: "bg-sky-700",
      border: "border-sky-200",
      borderActive: "border-sky-700",
      text: "text-sky-700",
      textActive: "text-white",
      icon: "bg-sky-100 text-sky-600",
      iconActive: "bg-white/20",
      progress: "bg-sky-500",
      progressActive: "bg-white/70",
    };
  } else if (pct >= 34) {
    // 34-66% — amber/orange (moderate progress)
    return {
      bg: "bg-amber-50",
      bgActive: "bg-amber-600",
      border: "border-amber-200",
      borderActive: "border-amber-600",
      text: "text-amber-700",
      textActive: "text-white",
      icon: "bg-amber-100 text-amber-600",
      iconActive: "bg-white/20",
      progress: "bg-amber-500",
      progressActive: "bg-white/70",
    };
  } else if (pct > 0) {
    // 1-33% — rose (low progress)
    return {
      bg: "bg-rose-50",
      bgActive: "bg-rose-600",
      border: "border-rose-200",
      borderActive: "border-rose-600",
      text: "text-rose-700",
      textActive: "text-white",
      icon: "bg-rose-100 text-rose-600",
      iconActive: "bg-white/20",
      progress: "bg-rose-500",
      progressActive: "bg-white/70",
    };
  } else {
    // 0% — gray (not started)
    return {
      bg: "bg-gray-50",
      bgActive: "bg-gray-600",
      border: "border-gray-200",
      borderActive: "border-gray-600",
      text: "text-gray-600",
      textActive: "text-white",
      icon: "bg-gray-100 text-gray-500",
      iconActive: "bg-white/20",
      progress: "bg-gray-400",
      progressActive: "bg-white/70",
    };
  }
}

/** Sort control IDs numerically (3.1.1, 3.1.2, … 3.1.9, 3.1.10) instead of lexicographically. */
function compareControlIds(a: string, b: string): number {
  const partsA = a.split(".").map((s) => parseInt(s, 10) || 0);
  const partsB = b.split(".").map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const na = partsA[i] ?? 0;
    const nb = partsB[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** Canonical control count per family (NIST SP 800-171 Rev 2: 110 total). Use family prefix (3.1 vs 3.10) so AC is 22, not 58. */
const FAMILY_CONTROL_COUNTS: Record<string, number> = (() => {
  const counts: Record<string, number> = {};
  for (const f of CONTROL_FAMILIES) {
    counts[f.code] = ALL_CONTROL_IDS.filter((id) => getControlFamilyPrefix(id) === f.controlPrefix).length;
  }
  return counts;
})();

export function SCTMPage({ userRole = "Compliance" }: { userRole?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const family = searchParams.get("family");
  const type = (searchParams.get("type") as "all" | "configuration" | "governance" | "partial") || "all";
  const statusFilter = (searchParams.get("status") as "implemented" | "inherited" | "not_applicable" | "outstanding" | null) ?? null;
  const controlId = searchParams.get("control");

  const [records, setRecords] = useState<SCTMRecord[]>([]);
  const [nistList, setNistList] = useState<NistRow[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [optimizedList, setOptimizedList] = useState<SctmOptimizedControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ updated: number; total: number } | null>(null);
  const [familiesOpen, setFamiliesOpen] = useState(true);

  // Auto-collapse families when a control is selected to maximize detail panel space.
  // User can still manually re-expand.
  useEffect(() => {
    if (controlId) setFamiliesOpen(false);
    else setFamiliesOpen(true);
  }, [controlId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const optimizedByControlId = useMemo(
    () => (optimizedList.length > 0 ? getOptimizedByControlId(optimizedList) : {}),
    [optimizedList]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes, labelsRes, ultimateRes, fallbackRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
        fetch("/api/governance-documents/uploaded-labels"),
        fetch("/CMMC_SCTM_Ultimate_Onboarding_Data.json").catch(() => null),
        fetch("/CMMC_SCTM_UI_Optimized.json").catch(() => null),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (nistRes.ok) setNistList(await nistRes.json());
      if (labelsRes.ok) {
        const d = await labelsRes.json().catch(() => ({}));
        setUploadedLabels(d.uploadedLabels ?? []);
      }
      const optArr = ultimateRes?.ok ? await ultimateRes.json() : fallbackRes?.ok ? await fallbackRes.json() : null;
      if (Array.isArray(optArr) && optArr.length > 0) setOptimizedList(optArr);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nistByControlId = useMemo(() => Object.fromEntries(nistList.map((n) => [n.controlId, n])), [nistList]);

  const filteredRecords = useMemo(() => {
    let list = records;
    if (family) {
      const fam = CONTROL_FAMILIES.find((f) => f.code === family);
      if (fam) list = list.filter((r) => getControlFamilyPrefix(r.controlId) === fam.controlPrefix);
    }
    if (type !== "all") {
      if (type === "partial") {
        list = list.filter((r) => r.evidencePartial === true);
      } else if (type === "governance") {
        list = list.filter((r) => r.satisfiedByGovernance === true);
      } else if (type === "configuration") {
        list = list.filter(
          (r) =>
            r.satisfiedByOs === true || r.satisfiedByCloud === true || r.satisfiedByHybrid === true
        );
      }
    }
    if (statusFilter) {
      if (statusFilter === "implemented") {
        list = list.filter((r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed");
      } else if (statusFilter === "inherited") {
        list = list.filter((r) => r.implementationStatus === "inherited");
      } else if (statusFilter === "not_applicable") {
        list = list.filter((r) => r.implementationStatus === "not_applicable");
      } else if (statusFilter === "outstanding") {
        list = list.filter((r) => r.implementationStatus === "not_started" || r.implementationStatus === "in_progress");
      }
    }
    const byControlId = new Map<string, SCTMRecord>();
    for (const r of list) {
      if (!byControlId.has(r.controlId)) byControlId.set(r.controlId, r);
    }
    let result = Array.from(byControlId.values()).sort((a, b) => compareControlIds(a.controlId, b.controlId));

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((r) => {
        const opt = optimizedByControlId[r.controlId];
        const nist = nistByControlId[r.controlId];
        const searchable = [
          r.controlId,
          opt?.title,
          opt?.summary,
          opt?.requirement,
          nist?.title,
          nist?.nistExactText,
          ...(opt?.objectives?.map((o) => o.text) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }
    return result;
  }, [records, family, type, statusFilter, debouncedSearch, optimizedByControlId, nistByControlId]);

  const selectedRecord = useMemo(
    () => (controlId ? records.find((r) => r.controlId === controlId) ?? null : null),
    [records, controlId]
  );
  const selectedNist = selectedRecord ? nistByControlId[selectedRecord.controlId] : undefined;

  // A record is fully adjudicated when both evidence lanes are satisfied (if required),
  // or just the implementation status if no policy doc is required.
  function isFullyAdjudicated(r: (typeof records)[0]): boolean {
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied";
    }
    return ADJUDICATED.includes(r.implementationStatus);
  }

  const familyStats = useMemo(() => {
    const adjudicatedControlIds = new Set(
      records.filter(isFullyAdjudicated).map((r) => r.controlId)
    );
    return CONTROL_FAMILIES.map((f) => {
      const total = FAMILY_CONTROL_COUNTS[f.code] ?? 0;
      const inFamilyIds = ALL_CONTROL_IDS.filter((id) => getControlFamilyPrefix(id) === f.controlPrefix);
      const adj = inFamilyIds.filter((id) => adjudicatedControlIds.has(id)).length;
      const pct = total ? Math.round((adj / total) * 100) : 0;
      return { code: f.code, plainName: f.plainName, name: f.name, total, adjudicated: adj, pct, icon: f.icon };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const adjudicatedControlIds = useMemo(
    () => new Set(records.filter(isFullyAdjudicated).map((r) => r.controlId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records]
  );
  const partialControlIds = useMemo(
    () => new Set(records.filter((r) => r.evidencePartial === true).map((r) => r.controlId)),
    [records]
  );
  const adjudicatedCount = adjudicatedControlIds.size;
  const partialCount = partialControlIds.size;
  const outstandingCount = Math.max(0, 110 - adjudicatedCount - partialCount);

  function setFamily(code: string | null) {
    const u = new URLSearchParams(searchParams.toString());
    if (code) u.set("family", code);
    else u.delete("family");
    u.delete("control");
    router.replace(`/dashboard/controls?${u.toString()}`, { scroll: false });
  }
  function setType(t: "all" | "configuration" | "governance" | "partial") {
    const u = new URLSearchParams(searchParams.toString());
    u.set("type", t);
    u.delete("control");
    router.replace(`/dashboard/controls?${u.toString()}`, { scroll: false });
  }
  function setStatus(s: "implemented" | "inherited" | "not_applicable" | "outstanding" | null) {
    const u = new URLSearchParams(searchParams.toString());
    if (s) u.set("status", s);
    else u.delete("status");
    u.delete("control");
    router.replace(`/dashboard/controls?${u.toString()}`, { scroll: false });
  }
  function setControl(id: string | null) {
    const u = new URLSearchParams(searchParams.toString());
    if (id) u.set("control", id);
    else u.delete("control");
    router.replace(`/dashboard/controls?${u.toString()}`, { scroll: false });
  }

  if (loading && records.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-[var(--color-gray-500)]">Loading controls…</p>
      </div>
    );
  }

  const STATUS_LABELS: Record<string, string> = {
    implemented: "Implemented / Assessed",
    inherited: "Inherited",
    not_applicable: "Not Applicable",
    outstanding: "Outstanding (not started / in progress)",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[var(--color-gray-50)]/30 to-transparent">
      {/* Active status filter banner */}
      {statusFilter && (
        <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-800/40 dark:bg-blue-950/20">
          <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
            Filtered: <strong>{STATUS_LABELS[statusFilter]}</strong> — {filteredRecords.length} control{filteredRecords.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setStatus(null)}
            className="ml-auto text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Clear filter ×
          </button>
        </div>
      )}
      {/* Header: Compact toolbar + collapsible family cards */}
      <header className="border-b border-[var(--color-border)]/80 bg-white/80 backdrop-blur-xl shadow-sm shadow-black/[0.02]">
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Control families — collapsible section */}
          <section>
            <button
              type="button"
              onClick={() => setFamiliesOpen(!familiesOpen)}
              className="w-full flex items-center gap-2 text-left"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <Layers className="h-3.5 w-3.5" aria-hidden />
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-[var(--color-gray-900)]">Control families</h2>
              {/* Compact summary when collapsed */}
              {!familiesOpen && (
                <div className="flex items-center gap-2 ml-1">
                  {family ? (
                    (() => {
                      const activeFam = familyStats.find((f) => f.code === family);
                      if (!activeFam) return null;
                      const colors = getPercentageColors(activeFam.pct, false);
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.border} ${colors.text}`}>
                          {activeFam.code} — {activeFam.name}
                          <span className="text-[10px] opacity-70">{activeFam.adjudicated}/{activeFam.total}</span>
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-[var(--color-gray-500)]">
                      {adjudicatedCount}/110 adjudicated
                    </span>
                  )}
                </div>
              )}
              <ChevronDown className={`ml-auto h-4 w-4 text-[var(--color-gray-400)] transition-transform ${familiesOpen ? "rotate-180" : ""}`} />
            </button>
            {/* Expandable family cards grid */}
            <div className={`grid transition-[grid-template-rows] duration-200 ${familiesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="pt-3 space-y-2">
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-gray-500)]">
                    <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-400" /><span>0%</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /><span>1-33%</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /><span>34-66%</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-500" /><span>67-99%</span></div>
                    <div className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-teal-500" /><span>100%</span></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
                    {familyStats.map((f) => {
                      const isActive = family === f.code;
                      const Icon = f.icon;
                      const colors = getPercentageColors(f.pct, isActive);
                      return (
                        <button
                          key={f.code}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFamily(isActive ? null : f.code); }}
                          title={`${f.name}: ${f.adjudicated}/${f.total} adjudicated (${f.pct}%)`}
                          className={`group relative flex min-h-[72px] flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                            isActive
                              ? `${colors.bgActive} ${colors.borderActive} text-white shadow-md`
                              : `${colors.bg} ${colors.border} hover:shadow-md hover:shadow-black/[0.04]`
                          }`}
                        >
                          <div className="flex w-full items-center gap-2">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${isActive ? colors.iconActive : colors.icon}`}>
                              <Icon className="h-3.5 w-3.5" aria-hidden />
                            </div>
                            <span className={`font-mono text-xs font-bold tabular-nums truncate ${isActive ? colors.textActive : colors.text}`}>{f.code}</span>
                          </div>
                          <span className={`mt-1 line-clamp-2 text-[11px] leading-tight ${isActive ? "text-white/95" : colors.text}`}>
                            {f.name}
                          </span>
                          <div className="mt-2 w-full space-y-1">
                            <div className="flex justify-between text-[10px] tabular-nums">
                              <span className={isActive ? "text-white/80" : "text-[var(--color-gray-500)]"}>
                                {f.adjudicated}/{f.total}
                              </span>
                              {f.total > 0 && (
                                <span className={isActive ? "text-white/70" : "text-[var(--color-gray-400)]"}>{f.pct}%</span>
                              )}
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${isActive ? colors.progressActive : colors.progress}`}
                                style={{ width: `${Math.min(100, f.pct)}%` }}
                                aria-hidden
                              />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* Stats + filters row */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)]/60 pt-3">
            <span className="text-xs text-[var(--color-gray-500)]">
              <strong className="text-[var(--color-gray-800)]">{adjudicatedCount}</strong> adjudicated
              {partialCount > 0 && (
                <>
                  <span className="mx-1.5 text-[var(--color-gray-300)]">·</span>
                  <strong className="text-amber-700">{partialCount}</strong> partial
                </>
              )}
              <span className="mx-1.5 text-[var(--color-gray-300)]">·</span>
              <strong className="text-[var(--color-gray-800)]">{outstandingCount}</strong> outstanding
            </span>
            <div className="h-3 w-px bg-[var(--color-border)]/60" aria-hidden />
            {/* Bulk load vault narratives */}
            {userRole !== "Assessor" && outstandingCount > 0 && (
              <button
                type="button"
                disabled={bulkLoading}
                onClick={async () => {
                  setBulkLoading(true);
                  setBulkResult(null);
                  try {
                    const res = await fetch("/api/control-records/bulk-load-vault", { method: "POST" });
                    if (res.ok) {
                      const data = await res.json();
                      setBulkResult(data);
                      // Refresh control records
                      const rr = await fetch("/api/control-records");
                      if (rr.ok) { const d = await rr.json(); setRecords(d); }
                    }
                  } finally {
                    setBulkLoading(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                {bulkLoading ? "Loading…" : "Load Vault narratives"}
              </button>
            )}
            {bulkResult && (
              <span className="text-xs text-teal-700 font-medium">
                ✓ {bulkResult.updated} narratives loaded
              </span>
            )}
            <div className="h-3 w-px bg-[var(--color-border)]/60" aria-hidden />
            <div className="flex items-center gap-1">
              {(["all", "configuration", "governance", "partial"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    type === t ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)]"
                  }`}
                >
                  {t === "all" ? "All" : t === "configuration" ? "Configuration" : t === "governance" ? "Governance" : "Partial"}
                </button>
              ))}
            </div>
            {/* Search input */}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-gray-400)]" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search controls…"
                className="w-56 rounded-lg border border-[var(--color-border)] bg-white py-1.5 pl-8 pr-2.5 text-xs text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/20"
                aria-label="Search controls"
              />
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`rounded-full p-1.5 transition-colors ${viewMode === "list" ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)]"}`}
                title="List view"
                aria-pressed={viewMode === "list"}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-full p-1.5 transition-colors ${viewMode === "grid" ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)]"}`}
                title="Grid view"
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Master-detail: control grid (default) OR detail panel (when control selected) */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {selectedRecord ? (
          <div className="mx-auto max-w-5xl w-full px-5 py-4">
            {/* Back button */}
            <button
              type="button"
              onClick={() => setControl(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-gray-600)] hover:text-[var(--color-gray-900)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to controls
              {family && (
                <span className="text-[var(--color-gray-400)]">
                  · {CONTROL_FAMILIES.find((f) => f.code === family)?.name}
                </span>
              )}
            </button>
            <SCTMControlDetail
              record={selectedRecord}
              nist={selectedNist}
              sctmOptimized={optimizedByControlId[selectedRecord.controlId] ?? undefined}
              orgUploadedLabels={uploadedLabels}
              onSaved={fetchData}
              userRole={userRole}
            />
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* Grid context header */}
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                  {family
                    ? `${CONTROL_FAMILIES.find((f) => f.code === family)?.name ?? family} · ${filteredRecords.length} control${filteredRecords.length !== 1 ? "s" : ""}`
                    : statusFilter
                    ? `${STATUS_LABELS[statusFilter]} · ${filteredRecords.length} control${filteredRecords.length !== 1 ? "s" : ""}`
                    : `All controls · ${filteredRecords.length} of 110`}
                </h2>
                <p className="text-xs text-[var(--color-gray-500)] mt-0.5">Click a control to adjudicate.</p>
              </div>
              {(family || statusFilter || type !== "all" || debouncedSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setFamily(null);
                    setStatus(null);
                    setType("all");
                    setSearchQuery("");
                  }}
                  className="text-xs text-[var(--color-gray-500)] hover:text-[var(--color-gray-900)] hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {filteredRecords.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-center">
                <div>
                  <p className="text-sm text-[var(--color-gray-600)]">No controls match the current filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFamily(null);
                      setStatus(null);
                      setType("all");
                      setSearchQuery("");
                    }}
                    className="mt-2 text-xs text-[var(--color-blue-accent)] hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            ) : (
              <ul
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                    : "space-y-2"
                }
                role="list"
              >
                {filteredRecords.map((r) => {
                  const opt = optimizedByControlId[r.controlId];
                  const nist = nistByControlId[r.controlId];
                  const title = opt?.title ?? nist?.title ?? r.controlId;
                  const summary = opt?.summary ?? "";
                  return (
                    <li key={r.controlId}>
                      <button
                        type="button"
                        onClick={() => setControl(r.controlId)}
                        className="w-full text-left rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 hover:border-[var(--color-primary)]/40 hover:shadow-md hover:shadow-black/[0.04] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-mono text-sm font-bold text-[var(--color-navy-primary)] shrink-0">
                              {r.controlId}
                            </span>
                            {r.evidencePartial ? (
                              <>
                                <StatusBadge status="in_progress" />
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800">
                                  Partial
                                </span>
                              </>
                            ) : (
                              <StatusBadge status={r.implementationStatus} />
                            )}
                          </div>
                        </div>
                        <p className="font-medium text-[var(--color-gray-900)] leading-snug text-sm mb-1 line-clamp-2">
                          {title}
                        </p>
                        {summary && viewMode === "grid" && (
                          <p className="text-xs text-[var(--color-gray-500)] line-clamp-2 leading-relaxed">
                            {summary}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {r.satisfiedByHybrid ? (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-800">
                              Hybrid
                            </span>
                          ) : (
                            <>
                              {r.satisfiedByOs && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700">
                                  OS
                                </span>
                              )}
                              {r.satisfiedByCloud && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 text-sky-800">
                                  Cloud
                                </span>
                              )}
                              {r.satisfiedByGovernance && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-800">
                                  Governance
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
