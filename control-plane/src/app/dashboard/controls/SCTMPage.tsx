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

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* Left: filters */}
      <aside className="w-56 shrink-0 space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
        <SCTMFilters
          records={records}
          family={family}
          type={type}
          onFamilyChange={setFamily}
          onTypeChange={setType}
        />
      </aside>

      <div className="min-w-0 flex-1 flex gap-6">
        {/* Center: control list */}
        <div className="w-80 shrink-0 flex flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Controls</h2>
            <p className="text-xs text-[var(--color-gray-500)]">{filteredRecords.length} shown</p>
          </div>
          <ul className="flex-1 overflow-y-auto" role="list">
            {filteredRecords.map((r) => {
              const nist = nistByControlId[r.controlId];
              const title = nist?.title ?? r.controlId;
              const isSelected = r.controlId === controlId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setControl(isSelected ? null : r.controlId)}
                    className={`w-full border-b border-[var(--color-border-muted)] px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-blue-accent)] ${
                      isSelected
                        ? "bg-[var(--color-blue-accent)]/10 ring-inset ring-1 ring-[var(--color-blue-accent)]"
                        : "hover:bg-[var(--color-gray-50)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-[var(--color-gray-600)]">{r.controlId}</span>
                      <StatusBadge status={r.implementationStatus} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-gray-800)]">{title}</p>
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
            <div className="flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
              <p className="text-sm text-[var(--color-gray-500)]">Select a control to view details and adjudicate.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
