"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Cloud, CheckCircle2, AlertCircle, ChevronRight, Upload } from "lucide-react";
import {
  AZURE_ENTRA_15_CONTROL_IDS,
  AZURE_ENTRA_BASELINE,
} from "@/lib/compliance/azure-entra-controls";

/**
 * AzureEntraEvidenceCard
 *
 * Status-only summary of the cloud-evidence pipeline. Replaces the older
 * pattern that had 15 separate file-upload widgets (one per control) — that
 * was wrong because the validator (`validate_azure_entra.py`) produces ONE
 * report (validation-report-azure-entra.json) covering all 15 controls. The
 * customer uploads that ONE report, not 15 separate files.
 *
 * Deep-links to /dashboard/evidence/upload-manifest for the actual ingest;
 * shows here only:
 *   - Which 15 controls the cloud pipeline covers
 *   - Per-control evidenced/not status (sourced from control_records)
 *   - The latest validator version expected
 */

type ControlRecord = {
  id: string;
  controlId: string;
  artifactCount: number;
};

export function AzureEntraEvidenceCard({ boundaryId: _boundaryId }: { boundaryId: string }) {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setError(null);
    try {
      const controlIds = AZURE_ENTRA_15_CONTROL_IDS.join(",");
      const res = await fetch(`/api/control-records?controlIds=${encodeURIComponent(controlIds)}`);
      if (!res.ok) throw new Error("Failed to load control records");
      const data = (await res.json()) as ControlRecord[];
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const baselineByControlId = Object.fromEntries(
    AZURE_ENTRA_BASELINE.map((e) => [e.controlId, e])
  );

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  if (loading) {
    return (
      <section className={cardClass}>
        <p className="text-sm text-[var(--color-gray-500)]">Loading cloud evidence status…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={cardClass}>
        <p className="text-sm text-[var(--color-status-red)]">{error}</p>
      </section>
    );
  }

  const evidencedCount = records.filter((r) => r.artifactCount > 0).length;
  const totalControls = AZURE_ENTRA_15_CONTROL_IDS.length;
  const allEvidenced = evidencedCount === totalControls && totalControls > 0;
  const noneEvidenced = evidencedCount === 0;

  return (
    <section className={cardClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--color-gray-900)]">
            <Cloud className="h-5 w-5 text-blue-600" aria-hidden />
            Cloud evidence pipeline
          </h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            {totalControls} Azure/Entra controls validated by{" "}
            <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 text-[11px]">
              validate_azure_entra.py
            </code>{" "}
            v1.5+. Run the collector + validator, then upload the resulting{" "}
            <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 text-[11px]">
              validation-report-azure-entra.json
            </code>{" "}
            once — it adjudicates all {totalControls} cloud-side controls in a single ingest.
          </p>
          {/* Status summary */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {allEvidenced ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                All {totalControls} cloud controls evidenced
              </span>
            ) : noneEvidenced ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                <AlertCircle className="h-3 w-3" />
                No cloud evidence ingested yet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                <AlertCircle className="h-3 w-3" />
                Partial cloud coverage ({evidencedCount}/{totalControls}) — re-upload the latest{" "}
                <code className="rounded bg-white/60 px-1 font-mono text-[10px]">
                  validation-report-azure-entra.json
                </code>{" "}
                to refresh
              </span>
            )}
          </div>
        </div>

        <Link
          href="/dashboard/evidence/upload-manifest"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Upload className="h-4 w-4" />
          Upload validator run
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Read-only list of which controls the cloud pipeline covers */}
      <details className="mt-4 group">
        <summary className="cursor-pointer text-xs font-medium text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]">
          Show the {totalControls} controls covered by this pipeline
        </summary>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {AZURE_ENTRA_15_CONTROL_IDS.map((controlId) => {
            const record = records.find((r) => r.controlId === controlId);
            const baseline = baselineByControlId[controlId];
            const hasEvidence = (record?.artifactCount ?? 0) > 0;
            return (
              <div
                key={controlId}
                className="flex items-start gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 px-2.5 py-1.5"
              >
                {hasEvidence ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[11px] font-medium text-[var(--color-gray-700)]">
                      {controlId}
                    </span>
                    <span className="truncate text-xs text-[var(--color-gray-600)]">
                      {baseline?.title ?? controlId}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
