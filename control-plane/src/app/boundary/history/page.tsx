"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SnapshotSummary {
  snapshot_id: string;
  created_at: string;
  allocation_hash: string;
  registry_version: string;
  counts: {
    inherited: number;
    shared: number;
    customer: number;
    notApplicable: number;
  } | null;
  warnings_summary: {
    sensitivity_warning_count: number;
    secondary_layer_warning_count: number;
    configured_but_not_creditable_risk_count: number;
  };
}

export default function BoundaryHistoryPage() {
  const [list, setList] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/boundary/snapshots")
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Boundary snapshot history</h1>
          <Link
            href="/boundary"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Back to boundary
          </Link>
        </div>

        <p className="text-slate-600">
          Append-only list of allocation snapshots (most recent first).
        </p>

        {loading ? (
          <p className="text-slate-600">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-slate-600">No snapshots yet. Save a boundary to create one.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">
                    Allocation hash
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">
                    Registry version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">Counts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">
                    Warnings
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {list.map((row) => (
                  <tr key={row.snapshot_id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {row.allocation_hash.slice(0, 16)}…
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {row.registry_version || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {row.counts
                        ? `I:${row.counts.inherited} S:${row.counts.shared} C:${row.counts.customer} N:${row.counts.notApplicable}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      sens: {row.warnings_summary.sensitivity_warning_count}, sec:{" "}
                      {row.warnings_summary.secondary_layer_warning_count}, cred:{" "}
                      {row.warnings_summary.configured_but_not_creditable_risk_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
