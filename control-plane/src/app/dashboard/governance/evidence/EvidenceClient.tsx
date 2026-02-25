"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Item = {
  id: string;
  title: string;
  evidenceType: string;
  sourceSystem: string | null;
  collectedAt: string;
  validityEnd: string | null;
  isStale: boolean;
};

export default function EvidenceClient() {
  const searchParams = useSearchParams();
  const evidenceType = searchParams.get("evidence_type") ?? "";
  const stale = searchParams.get("stale") === "1";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const [data, setData] = useState<{ items: Item[]; total: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (evidenceType) params.set("evidence_type", evidenceType);
    if (stale) params.set("stale", "1");
    params.set("page", String(page));
    params.set("limit", "20");
    fetch(`/api/governance/evidence?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData({ items: [], total: 0, limit: 20 }))
      .finally(() => setLoading(false));
  }, [evidenceType, stale, page]);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const basePath = "/dashboard/governance/evidence";

  const buildUrl = (updates: Record<string, string>) => {
    const p = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `${basePath}?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-[var(--color-gray-700)]">Type</label>
        <select
          value={evidenceType}
          onChange={(e) => window.location.href = buildUrl({ evidence_type: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="screenshot">Screenshot</option>
          <option value="export_file">Export file</option>
          <option value="log_snippet">Log snippet</option>
          <option value="config_baseline">Config baseline</option>
          <option value="policy_export">Policy export</option>
          <option value="ticket">Ticket</option>
          <option value="training_record">Training record</option>
          <option value="incident_report">Incident report</option>
          <option value="risk_report">Risk report</option>
          <option value="other">Other</option>
        </select>
        <label className="ml-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={stale}
            onChange={(e) => window.location.href = buildUrl({ stale: e.target.checked ? "1" : "", page: "1" })}
            className="rounded border-[var(--color-border)]"
          />
          <span className="text-sm font-medium text-[var(--color-gray-700)]">Stale only</span>
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Title</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Type</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Source</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Collected</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Validity end</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]">
                    <td className="px-4 py-3 font-medium text-[var(--color-gray-900)]">{item.title}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{item.evidenceType}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{item.sourceSystem ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{new Date(item.collectedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{item.validityEnd ? new Date(item.validityEnd).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      {item.isStale ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-status-red)]/20 text-[var(--color-status-red)]">Stale</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gray-100)] text-[var(--color-gray-700)]">OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/governance/evidence/${item.id}`}
                        className="font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total === 0 && <p className="text-sm text-[var(--color-gray-500)]">No evidence items.</p>}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-gray-600)]">Page {page} of {totalPages}</span>
              {page > 1 && <Link href={buildUrl({ page: String(page - 1) })} className="text-sm text-[var(--color-blue-accent)] hover:underline">Previous</Link>}
              {page < totalPages && <Link href={buildUrl({ page: String(page + 1) })} className="text-sm text-[var(--color-blue-accent)] hover:underline">Next</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
