"use client";

import { useState } from "react";
import { CONTROL_FAMILIES } from "./constants";
import { StatusBadge } from "./StatusBadge";
import type { ControlRecord } from "./GovernanceWizard";

type FamilyStat = { code: string; name: string; total: number; implemented: number };

export function WizardReview({
  records,
  familyStats,
  totalImplemented,
  totalInProgress,
  totalNotStarted,
  onBack,
}: {
  records: ControlRecord[];
  familyStats: FamilyStat[];
  totalImplemented: number;
  totalInProgress: number;
  totalNotStarted: number;
  onBack: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      const res = await fetch("/api/governance-wizard/progress-report", { method: "GET" });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "governance-progress-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab if API not ready
      window.open("/api/governance-wizard/progress-report", "_blank");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-[#0F172A]">Review & finalize</h1>
      <p className="mt-2 text-gray-600">Summary of all 110 controls by family.</p>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Implemented</p>
          <p className="text-2xl font-bold text-blue-600">{totalImplemented}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">In progress</p>
          <p className="text-2xl font-bold text-amber-600">{totalInProgress}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Not started</p>
          <p className="text-2xl font-bold text-gray-600">{totalNotStarted}</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-[#0F172A]">Controls by family</h2>
        <div className="mt-4 space-y-4">
          {CONTROL_FAMILIES.map((f) => {
            const controlsInFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
            return (
              <div key={f.code} className="rounded border border-gray-200 p-4">
                <h3 className="font-medium text-[#0F172A]">{f.code} — {f.name}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {controlsInFamily.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-sm"
                    >
                      {r.controlId}
                      <StatusBadge status={r.implementationStatus} />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to controls
        </button>
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={downloading}
          className="rounded-md bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50"
        >
          {downloading ? "Generating…" : "Download progress report"}
        </button>
      </div>
    </div>
  );
}
