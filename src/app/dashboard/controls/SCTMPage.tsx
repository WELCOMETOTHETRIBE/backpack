"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { SCTMFilters, type SCTMRecord } from "./SCTMFilters";
import { SCTMControlDetail, type NistRow } from "./SCTMControlDetail";

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
        <p className="text-sm text-[var(--color-gray-600)]">Loading controls…</p>
      </div>
    );
  }

  const familyStats = useMemo(() => {
    const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];
    return CONTROL_FAMILIES.map((f) => {
      const inFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
      const adj = inFamily.filter((r) => ADJUDICATED.includes(r.implementationStatus)).length;
      return { code: f.code, plainName: f.plainName, name: f.name, total: inFamily.length, adjudicated: adj };
    });
  }, [records]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Top: control family chips for filtering / tallying */}
      <section
        className="flex flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm"
        aria-label="Control families"
      >
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Family
        </span>
        {familyStats.map((f) => {
          const isActive = family === f.code;
          return (
            <button
              key={f.code}
              type="button"
              onClick={() => setFamily(isActive ? null : f.code)}
              title={`${f.name}: ${f.adjudicated}/${f.total} adjudicated`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                isActive
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-gray-100)] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)]"
              }`}
            >
              <span className="font-mono text-xs opacity-90">{f.code}</span>
              <span className="max-w-[8rem] truncate">{f.plainName}</span>
              <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs tabular-nums">
                {f.adjudicated}/{f.total}
              </span>
            </button>
          );
        })}
      </section>

      <div className="flex min-h-0 flex-1 gap-6">
      {/* Left: type & status filters */}
      <aside className="w-56 shrink-0 space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <SCTMFilters
          records={records}
          family={family}
          type={type}
          onFamilyChange={setFamily}
          onTypeChange={setType}
          hideFamilyList
        />
      </aside>

      <div className="min-w-0 flex-1 flex gap-6">
        {/* Center: control list */}
        <div className="w-80 shrink-0 flex flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Controls</h2>
            <p className="text-xs text-[var(--color-gray-500)]">{filteredRecords.length} shown</p>
          </div>
          <ul className="flex-1 overflow-y-auto p-2" role="list">
            {filteredRecords.map((r) => {
              const nist = nistByControlId[r.controlId];
              const title = nist?.title ?? r.controlId;
              const description = nist?.nistExactText ?? null;
              const hasGuide = Boolean(nist?.nistDiscussionGuidance);
              const isSelected = r.controlId === controlId;
              return (
                <li key={r.id} className="mb-1.5 last:mb-0">
                  <button
                    type="button"
                    onClick={() => setControl(isSelected ? null : r.controlId)}
                    className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                      isSelected
                        ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-[var(--color-border)] border-l-4 border-l-[var(--color-primary)]"
                        : "border border-transparent hover:bg-white/80 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:border-[var(--color-border)]/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold tracking-tight text-[var(--color-navy-primary)]">{r.controlId}</span>
                      <StatusBadge status={r.implementationStatus} />
                    </div>
                    <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--color-gray-900)] line-clamp-2">{title}</p>
                    {description && (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-gray-600)]">{description}</p>
                    )}
                    {hasGuide && (
                      <p className="mt-1 text-[12px] text-[var(--color-gray-400)]">Assessment guide available</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right: detail (multi-card) */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selectedRecord ? (
            <SCTMControlDetail
              record={selectedRecord}
              nist={selectedNist}
              orgUploadedLabels={uploadedLabels}
              onSaved={fetchData}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[420px] rounded-3xl border border-[var(--color-border)]/60 bg-white/60 p-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-gray-100)] flex items-center justify-center mb-5">
                <span className="text-2xl text-[var(--color-gray-400)]" aria-hidden>◇</span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-gray-800)] tracking-tight">Select a control</h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-[var(--color-gray-500)]">
                Choose a control from the list to view the requirement, full assessment guide, evidence, and adjudication.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
