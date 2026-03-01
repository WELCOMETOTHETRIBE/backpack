"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, LayoutList, LayoutGrid } from "lucide-react";
import { getSpecForControl, ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES, getControlFamilyPrefix } from "@/components/governance-wizard/constants";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { type SCTMRecord } from "./SCTMFilters";
import { SCTMControlDetail, type NistRow } from "./SCTMControlDetail";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getOptimizedByControlId } from "@/lib/sctm-optimized-types";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

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

export function SCTMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const family = searchParams.get("family");
  const type = (searchParams.get("type") as "all" | "configuration" | "governance" | "partial") || "all";
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
      if (fam) list = list.filter((r) => getControlFamilyPrefix(r.controlId) === fam.controlPrefix);
    }
    if (type !== "all") {
      if (type === "partial") {
        list = list.filter((r) => r.evidencePartial === true);
      } else {
        list = list.filter((r) => {
          const spec = getSpecForControl(r.controlId);
          if (!spec) return type === "configuration";
          if (type === "governance") return spec.satisfactionType === "Governance-Centric";
          return spec.satisfactionType === "Technical-Centric" || spec.satisfactionType === "Hybrid";
        });
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
      const inFamilyIds = ALL_CONTROL_IDS.filter((id) => getControlFamilyPrefix(id) === f.controlPrefix);
      const adj = inFamilyIds.filter((id) => adjudicatedControlIds.has(id)).length;
      return { code: f.code, plainName: f.plainName, name: f.name, total, adjudicated: adj };
    });
  }, [records]);

  const adjudicatedControlIds = useMemo(
    () => new Set(records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).map((r) => r.controlId)),
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
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[var(--color-gray-50)]/30 to-transparent">
      {/* Header: fixed at top of page (no sticky), compact */}
      <header className="border-b border-white/20 bg-white/60 backdrop-blur-xl px-3 py-2.5">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-gray-400)] mb-1.5">Control families</p>
            <div className="flex flex-wrap gap-1.5">
              {familyStats.map((f) => {
                const isActive = family === f.code;
                const pct = f.total ? Math.round((f.adjudicated / f.total) * 100) : 0;
                return (
                  <button
                    key={f.code}
                    type="button"
                    onClick={() => setFamily(isActive ? null : f.code)}
                    title={`${f.name}: ${f.adjudicated}/${f.total}`}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-medium transition-all duration-200 border ${
                      isActive
                        ? "bg-[var(--color-primary)]/90 text-white border-white/30 shadow-lg shadow-[var(--color-primary)]/10 backdrop-blur-sm"
                        : "bg-white/50 text-[var(--color-gray-700)] border-white/40 hover:bg-white/70 hover:border-white/50 backdrop-blur-sm"
                    }`}
                  >
                    <span className="font-mono font-semibold tabular-nums shrink-0">{f.code}</span>
                    <span className={`whitespace-nowrap ${isActive ? "text-white/95" : "text-[var(--color-gray-600)]"}`}>
                      {f.name}
                    </span>
                    <span className={`tabular-nums shrink-0 ${isActive ? "text-white/80" : "text-[var(--color-gray-500)]"}`}>
                      {f.adjudicated}/{f.total}
                    </span>
                    {pct > 0 && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-white/60" : "bg-[var(--color-primary)]/50"}`} aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

      <div className="flex min-h-0 flex-1 min-w-0">
        {/* Left: narrow control list — minimal width, compact cards */}
        <aside className="w-[13rem] shrink-0 flex flex-col border-r border-white/20 bg-white/40 backdrop-blur-md">
          <div className="px-2 py-1.5 border-b border-white/30">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-gray-400)]" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-white/50 bg-white/60 py-1 pl-7 pr-2 text-xs text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/20 backdrop-blur-sm"
                aria-label="Search controls"
              />
            </div>
          </div>
          <div className="px-2 py-1 border-b border-white/30 flex items-baseline justify-between gap-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Controls</h2>
            <span className="text-[10px] text-[var(--color-gray-500)] tabular-nums">{family ? filteredRecords.length : "—"}</span>
          </div>
          {!family && type !== "partial" ? (
            <div className="flex-1 flex items-center justify-center px-3 py-6 text-center">
              <p className="text-xs text-[var(--color-gray-500)] leading-snug">Select a control family above to view controls.</p>
            </div>
          ) : (
          <ul
            className={`flex-1 overflow-y-auto overscroll-contain px-1.5 py-1 ${viewMode === "grid" ? "grid grid-cols-1 gap-1" : "space-y-1"}`}
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
                    className={`w-full text-left rounded-lg border transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-1 ${
                      viewMode === "grid" ? "p-1.5" : "px-2 py-1.5"
                    } ${
                      isSelected
                        ? "bg-white/90 border-[var(--color-primary)]/40 shadow ring-1 ring-[var(--color-primary)]/20 backdrop-blur-sm"
                        : "bg-white/50 border-white/40 hover:bg-white/70 backdrop-blur-sm"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-[var(--color-navy-primary)] shrink-0">{r.controlId}</span>
                      {r.evidencePartial ? (
                        <>
                          <StatusBadge status="in_progress" />
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800" title="Technical evidence passed; accompanying gov docs, logs, or records required.">
                            Partial
                          </span>
                        </>
                      ) : (
                        <StatusBadge status={r.implementationStatus} />
                      )}
                      {r.satisfiedByHybrid ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-800" title="OS evidence + gov docs, or policy + technical (hybrid).">
                          Hybrid
                        </span>
                      ) : (
                        <>
                          {r.satisfiedByOs && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-700" title="Met by OS configuration (73 enclave controls).">
                              OS
                            </span>
                          )}
                          {r.satisfiedByCloud && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-100 text-sky-800" title="Met by cloud (5 inherited + 7 Azure/Entra).">
                              Cloud
                            </span>
                          )}
                          {r.satisfiedByGovernance && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-800" title="Met by governance (18 policy/documentation).">
                              Governance
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 font-medium text-[var(--color-gray-900)] leading-tight line-clamp-2 text-xs min-w-0">
                      {title}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </aside>

        {/* Detail — wide content area, minimal outer margin */}
        <main className="min-w-0 flex-1 overflow-y-auto px-3 py-3">
          {selectedRecord ? (
            <SCTMControlDetail
              record={selectedRecord}
              nist={selectedNist}
              sctmOptimized={optimizedByControlId[selectedRecord.controlId] ?? undefined}
              orgUploadedLabels={uploadedLabels}
              onSaved={fetchData}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
              <p className="text-sm text-[var(--color-gray-500)]">Select a control to view the requirement, assessment guide, evidence, and adjudication.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
