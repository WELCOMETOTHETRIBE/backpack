"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

type RunItem = {
  id: string;
  runId: string;
  systemId: string;
  collectedAt: string;
  collectorName: string;
  hostname: string | null;
  totalControls: number;
  passed: number;
};

type DriftItem = {
  systemId: string;
  hostname: string | null;
  previousRunId: string;
  latestRunId: string;
  latestRunUuid: string;
  regressions: Array<{ controlId: string }>;
  improvements: Array<{ controlId: string }>;
};

const cardClass =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export function TechnicalDashboardClient() {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [drift, setDrift] = useState<DriftItem[]>([]);
  const [totalRegressions, setTotalRegressions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/evidence-runs?limit=10").then((r) => (r.ok ? r.json() : { items: [], total: 0 })),
      fetch("/api/evidence-runs/drift").then((r) => (r.ok ? r.json() : { items: [], totalRegressions: 0 })),
    ])
      .then(([runsRes, driftRes]) => {
        setRuns(runsRes.items ?? []);
        setTotalRuns(runsRes.total ?? 0);
        setDrift(driftRes.items ?? []);
        setTotalRegressions(driftRes.totalRegressions ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const assetsWithRuns = new Set(runs.map((r) => r.systemId)).size;
  const latestRun = runs[0];

  if (loading) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
            <FolderOpen className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">Evidence runs</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">{totalRuns}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
            <Server className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">Assets with runs</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">{assetsWithRuns}</p>
        </div>
        <div className={cardClass}>
          <p className="text-sm font-medium text-[var(--color-gray-600)]">Latest run</p>
          {latestRun ? (
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">
              {latestRun.passed} <span className="font-normal text-[var(--color-gray-600)]">/ {latestRun.totalControls}</span> passed
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-gray-500)]">No runs yet</p>
          )}
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">Drift (regressions)</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-status-amber)]">{totalRegressions}</p>
          {totalRegressions > 0 && (
            <p className="mt-1 text-xs text-[var(--color-gray-500)]">Latest vs previous run per asset</p>
          )}
        </div>
      </div>

      {drift.length > 0 && (
        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Drift (latest vs previous run)</h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Controls that were pass and are now fail after the latest evidence run.
          </p>
          <ul className="mt-4 space-y-4">
            {drift.map((d) => (
              <li key={d.systemId} className="rounded-lg border border-[var(--color-border)] p-4">
                <div className="font-medium text-[var(--color-gray-900)]">
                  {d.hostname ?? d.systemId}
                </div>
                <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                  Previous: {d.previousRunId} → Latest: {d.latestRunId}
                </p>
                {d.regressions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.regressions.map((r) => (
                      <span
                        key={r.controlId}
                        className="inline-flex items-center gap-1 rounded bg-[var(--color-status-amber)]/20 px-2 py-0.5 text-xs font-medium text-[var(--color-status-amber)]"
                      >
                        <XCircle className="h-3 w-3" />
                        {r.controlId}
                      </span>
                    ))}
                  </div>
                )}
                <Link
                  href={`/dashboard/technical/runs/${d.latestRunUuid}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--color-blue-accent)] hover:underline"
                >
                  View latest run <ChevronRight className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={cardClass}>
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Evidence runs</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Recent runs with system-adjudicated control status (pass/fail by required evidence files).
        </p>
        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-gray-500)]">
            No evidence runs yet. Upload an evidence bundle to get started.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/dashboard/technical/runs/${run.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:bg-[var(--color-gray-50)]"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-medium text-[var(--color-gray-800)]">
                      {run.runId}
                    </span>
                    <span className="ml-2 text-sm text-[var(--color-gray-600)]">
                      {run.hostname ?? run.systemId}
                    </span>
                    <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                      {new Date(run.collectedAt).toLocaleString()} · {run.collectorName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      {run.passed}
                    </span>
                    <span className="text-sm text-[var(--color-gray-500)]">/ {run.totalControls}</span>
                    <ChevronRight className="h-4 w-4 text-[var(--color-gray-400)]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalRuns > 10 && (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            Showing latest 10 of {totalRuns} runs.
          </p>
        )}
      </section>
    </>
  );
}
