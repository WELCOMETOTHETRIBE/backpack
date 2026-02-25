"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { type SCTMRecord } from "./SCTMFilters";
import { SCTMControlDetail, type NistRow } from "./SCTMControlDetail";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

export function SCTMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const family = searchParams.get("family");
  const type = (searchParams.get("type") as "all" | "configuration" | "governance") || "all";
  const controlId = searchParams.get("control");

  const [records, setRecords] = useState<SCTMRecord[]>([]);
  const [nistList, setNistList] = useState<NistRow[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes, labelsRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
        fetch("/api/governance-documents/uploaded-labels"),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (nistRes.ok) setNistList(await nistRes.json());
      if (labelsRes.ok) {
        const d = await labelsRes.json().catch(() => ({}));
        setUploadedLabels(d.uploadedLabels ?? []);
      }
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
    return list.sort((a, b) => a.controlId.localeCompare(b.controlId));
  }, [records, family, type]);

  const selectedRecord = useMemo(
    () => (controlId ? records.find((r) => r.controlId === controlId) ?? null : null),
    [records, controlId]
  );
  const selectedNist = selectedRecord ? nistByControlId[selectedRecord.controlId] : undefined;

  const familyStats = useMemo(() => {
    return CONTROL_FAMILIES.map((f) => {
      const inFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
      const adj = inFamily.filter((r) => ADJUDICATED.includes(r.implementationStatus)).length;
      return { code: f.code, plainName: f.plainName, name: f.name, total: inFamily.length, adjudicated: adj };
    });
  }, [records]);

  const adjudicatedCount = records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).length;
  const outstandingCount = records.length - adjudicatedCount;

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
        <div className="ml-auto flex items-center gap-4 text-xs text-[var(--color-gray-500)]">
          <span><strong className="text-[var(--color-gray-800)]">{adjudicatedCount}</strong> adjudicated</span>
          <span><strong className="text-[var(--color-gray-800)]">{outstandingCount}</strong> outstanding</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 min-w-0">
        {/* Control list — minimal, clean */}
        <aside className="w-64 shrink-0 flex flex-col border-r border-[var(--color-border)]/60 bg-[var(--color-gray-50)]/50">
          <div className="px-4 py-3 border-b border-[var(--color-border)]/60">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Controls</h2>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">{filteredRecords.length} shown</p>
          </div>
          <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="list">
            {filteredRecords.map((r) => {
              const nist = nistByControlId[r.controlId];
              const title = nist?.title ?? r.controlId;
              const isSelected = r.controlId === controlId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setControl(isSelected ? null : r.controlId)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-1 ${
                      isSelected ? "bg-white shadow-sm text-[var(--color-gray-900)]" : "text-[var(--color-gray-700)] hover:bg-white/70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[var(--color-navy-primary)]">{r.controlId}</span>
                      <StatusBadge status={r.implementationStatus} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-gray-600)] line-clamp-2 leading-snug">{title}</p>
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
              orgUploadedLabels={uploadedLabels}
              onSaved={fetchData}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[360px] text-center px-6">
              <p className="text-[15px] text-[var(--color-gray-500)]">Select a control to view the requirement, assessment guide, evidence, and adjudication.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
