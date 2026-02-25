"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, LayoutList, LayoutGrid } from "lucide-react";
import { getSpecForControl, ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { type SCTMRecord } from "./SCTMFilters";
import { SCTMControlDetail, type NistRow } from "./SCTMControlDetail";
import { SCTMMetricsPanel } from "./SCTMMetricsPanel";
import { useComplianceMetrics } from "./useComplianceMetrics";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getOptimizedByControlId } from "@/lib/sctm-optimized-types";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

/** Canonical control count per family (NIST SP 800-171 Rev 2: 110 total). */
const FAMILY_CONTROL_COUNTS: Record<string, number> = (() => {
  const counts: Record<string, number> = {};
  for (const f of CONTROL_FAMILIES) {
    counts[f.code] = ALL_CONTROL_IDS.filter((id) => id.startsWith(f.controlPrefix)).length;
  }
  return counts;
})();

export function SCTMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const family = searchParams.get("family");
  const type = (searchParams.get("type") as "all" | "configuration" | "governance") || "all";
  const controlId = searchParams.get("control");

  const [records, setRecords] = useState<SCTMRecord[]>([]);
  const [nistList, setNistList] = useState<NistRow[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [optimizedList, setOptimizedList] = useState<SctmOptimizedControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

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
      if (fam) list = list.filter((r) => r.controlId.startsWith(fam.controlPrefix));
    }
    if (type !== "all") {
      list = list.filter((r) => {
        const spec = getSpecForControl(r.controlId);
        if (!spec) return type === "configuration";
        if (type === "governance") return spec.satisfactionType === "Governance-Centric";
        return spec.satisfactionType === "Technical-Centric" || spec.satisfactionType === "Hybrid";
      });
    }
    const byControlId = new Map<string, SCTMRecord>();
    for (const r of list) {
      if (!byControlId.has(r.controlId)) byControlId.set(r.controlId, r);
    }
    let result = Array.from(byControlId.values()).sort((a, b) => a.controlId.localeCompare(b.controlId));

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
  }, [records, family, type, debouncedSearch, optimizedByControlId, nistByControlId]);

  const selectedRecord = useMemo(
    () => (controlId ? records.find((r) => r.controlId === controlId) ?? null : null),
    [records, controlId]
  );
  const selectedNist = selectedRecord ? nistByControlId[selectedRecord.controlId] : undefined;

  const familyStats = useMemo(() => {
    const adjudicatedControlIds = new Set(
      records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).map((r) => r.controlId)
    );
    return CONTROL_FAMILIES.map((f) => {
      const total = FAMILY_CONTROL_COUNTS[f.code] ?? 0;
      const inFamilyIds = ALL_CONTROL_IDS.filter((id) => id.startsWith(f.controlPrefix));
      const adj = inFamilyIds.filter((id) => adjudicatedControlIds.has(id)).length;
      return { code: f.code, plainName: f.plainName, name: f.name, total, adjudicated: adj };
    });
  }, [records]);

  const adjudicatedControlIds = useMemo(
    () => new Set(records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).map((r) => r.controlId)),
    [records]
  );
  const adjudicatedCount = adjudicatedControlIds.size;
  const outstandingCount = 110 - adjudicatedCount;

  const metrics = useComplianceMetrics(records, optimizedByControlId);

  function setFamily(code: string | null) {
    const u = new URLSearchParams(searchParams.toString());
    if (code) u.set("family", code);
    else u.delete("family");
    u.delete("control");
    router.replace(`/dashboard/controls?${u.toString()}`, { scroll: false });
  }
  function setType(t: "all" | "configuration" | "governance") {
    const u = new URLSearchParams(searchParams.toString());
    u.set("type", t);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Single top bar: family chips + type + counts */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-border)]/60 bg-white/80 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-gray-400)]">Family</span>
          {familyStats.map((f) => {
            const isActive = family === f.code;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => setFamily(isActive ? null : f.code)}
                title={`${f.name}: ${f.adjudicated}/${f.total}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)]"
                }`}
              >
                {f.code} <span className="tabular-nums opacity-80">{f.adjudicated}/{f.total}</span>
              </button>
            );
          })}
        </div>
        <div className="h-4 w-px bg-[var(--color-border)]" aria-hidden />
        <div className="flex items-center gap-1">
          {(["all", "configuration", "governance"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-600)] hover:bg-[var(--color-gray-100)]"
              }`}
            >
              {t === "all" ? "All" : t === "configuration" ? "Configuration" : "Governance"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="sr-only">View mode</span>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-lg p-1.5 transition-colors ${viewMode === "list" ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)]"}`}
            title="List view"
            aria-pressed={viewMode === "list"}
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`rounded-lg p-1.5 transition-colors ${viewMode === "grid" ? "bg-[var(--color-gray-900)] text-white" : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)]"}`}
            title="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-[var(--color-gray-500)]">
          <span><strong className="text-[var(--color-gray-800)]">{adjudicatedCount}</strong> adjudicated</span>
          <span><strong className="text-[var(--color-gray-800)]">{outstandingCount}</strong> outstanding</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 min-w-0">
        {/* Left: search + control list */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-[var(--color-border)]/60 bg-[var(--color-gray-50)]/50">
          <div className="p-3 border-b border-[var(--color-border)]/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-gray-400)]" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search controls…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2 pl-8 pr-3 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
                aria-label="Search controls by title, description, or objectives"
              />
            </div>
          </div>
          <div className="px-4 py-3 border-b border-[var(--color-border)]/60">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Controls</h2>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">{filteredRecords.length} shown</p>
          </div>
          <ul
            className={`flex-1 overflow-y-auto p-3 ${viewMode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-2"}`}
            role="list"
          >
            {filteredRecords.map((r) => {
              const opt = optimizedByControlId[r.controlId];
              const nist = nistByControlId[r.controlId];
              const title = opt?.title ?? nist?.title ?? r.controlId;
              const description = opt?.summary ?? nist?.nistExactText?.replace(/\s+/g, " ").trim().slice(0, 120);
              const isSelected = r.controlId === controlId;
              return (
                <li key={r.controlId} className={viewMode === "grid" ? "min-w-0" : undefined}>
                  <button
                    type="button"
                    onClick={() => setControl(isSelected ? null : r.controlId)}
                    className={`w-full text-left rounded-xl border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                      viewMode === "grid"
                        ? "p-2.5"
                        : ""
                    } ${
                      isSelected
                        ? "bg-white border-[var(--color-primary)] shadow-md ring-1 ring-[var(--color-primary)]/20"
                        : "bg-white/70 border-[var(--color-border)]/80 hover:border-[var(--color-gray-300)] hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <div className={viewMode === "list" ? "px-4 py-3" : ""}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-[var(--color-navy-primary)] tracking-tight">{r.controlId}</span>
                        <StatusBadge status={r.implementationStatus} />
                        {opt?.compliance_meta?.satisfaction_type && viewMode === "list" && (
                          <span className="rounded bg-[var(--color-gray-100)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-gray-600)]">
                            {opt.compliance_meta.satisfaction_type.replace(/-/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className={`font-medium text-[var(--color-gray-900)] leading-snug line-clamp-2 ${viewMode === "list" ? "mt-2 text-[13px]" : "mt-1 text-xs"}`}>
                        {title}
                      </p>
                      {description && viewMode === "list" && (
                        <p className="mt-1 text-xs text-[var(--color-gray-500)] leading-relaxed line-clamp-2">
                          {description}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Detail — full width, scrollable */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-gray-50)]/30">
          {selectedRecord ? (
            <SCTMControlDetail
              record={selectedRecord}
              nist={selectedNist}
              sctmOptimized={optimizedByControlId[selectedRecord.controlId] ?? undefined}
              orgUploadedLabels={uploadedLabels}
              onSaved={fetchData}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[360px] text-center px-6">
              <p className="text-[15px] text-[var(--color-gray-500)]">Select a control to view the requirement, assessment guide, evidence, and adjudication.</p>
            </div>
          )}
        </main>

        {/* Right: compliance metrics */}
        <aside className="w-72 shrink-0 border-l border-[var(--color-border)]/60 bg-[var(--color-gray-50)]/50 overflow-y-auto">
          <SCTMMetricsPanel metrics={metrics} />
        </aside>
      </div>
    </div>
  );
}
