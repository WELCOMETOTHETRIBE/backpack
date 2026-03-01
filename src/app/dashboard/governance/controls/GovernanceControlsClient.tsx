"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Item = {
  id: string;
  controlId: string;
  cmmcRef: string;
  title: string;
  classification?: string;
  status?: string;
  roleName?: string | null;
  requiredDocuments: string[];
  requiredRegisters: string[];
};

export default function GovernanceControlsClient() {
  const searchParams = useSearchParams();
  const classification = searchParams.get("classification") ?? "";
  const status = searchParams.get("status") ?? "";
  const domain = searchParams.get("domain") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const [data, setData] = useState<{ items: Item[]; total: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (classification) params.set("classification", classification);
    if (status) params.set("status", status);
    if (domain) params.set("domain", domain);
    params.set("page", String(page));
    params.set("limit", "20");
    fetch(`/api/governance/controls?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [classification, status, domain, page]);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const basePath = "/dashboard/governance/controls";

  const buildUrl = (updates: Record<string, string>) => {
    const p = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `${basePath}?${p.toString()}`;
  };

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-status-red)] bg-[var(--color-surface)] p-4 text-[var(--color-status-red)]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-[var(--color-gray-700)]">Classification</label>
        <select
          value={classification}
          onChange={(e) => window.location.href = buildUrl({ classification: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="PURE_GOV">Pure Governance</option>
          <option value="HYBRID_GOVERNANCE">Hybrid Governance</option>
          <option value="HYBRID_GOV">Hybrid (all)</option>
          <option value="TECHNICAL">Pure Technical</option>
          <option value="HYBRID_TECHNICAL">Hybrid Technical</option>
        </select>
        <label className="ml-4 text-sm font-medium text-[var(--color-gray-700)]">Status</label>
        <select
          value={status}
          onChange={(e) => window.location.href = buildUrl({ status: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="implemented">Implemented</option>
          <option value="assessed">Assessed</option>
          <option value="inherited">Inherited</option>
          <option value="not_applicable">Not applicable</option>
        </select>
        <label className="ml-4 text-sm font-medium text-[var(--color-gray-700)]">Domain</label>
        <select
          value={domain}
          onChange={(e) => window.location.href = buildUrl({ domain: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="AC">AC</option>
          <option value="AT">AT</option>
          <option value="AU">AU</option>
          <option value="CA">CA</option>
          <option value="CM">CM</option>
          <option value="IA">IA</option>
          <option value="IR">IR</option>
          <option value="MA">MA</option>
          <option value="MP">MP</option>
          <option value="PE">PE</option>
          <option value="PS">PS</option>
          <option value="RA">RA</option>
          <option value="SC">SC</option>
          <option value="SI">SI</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">CMMC ref</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Title</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Classification</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Domain</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]">
                    <td className="px-4 py-3 font-mono text-[var(--color-gray-700)]">{item.cmmcRef}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-900)]">{item.title}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{item.classification ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gray-100)] text-[var(--color-gray-700)]">
                        {item.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">
                      {item.cmmcRef?.split(".")[0] ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/governance/controls/${encodeURIComponent(item.controlId)}`}
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
          {total === 0 && (
            <p className="text-sm text-[var(--color-gray-500)]">No controls match the filters. Run the governance seed if needed.</p>
          )}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-gray-600)]">
                Page {page} of {totalPages} ({total} total)
              </span>
              {page > 1 && (
                <Link href={buildUrl({ page: String(page - 1) })} className="text-sm text-[var(--color-blue-accent)] hover:underline">
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildUrl({ page: String(page + 1) })} className="text-sm text-[var(--color-blue-accent)] hover:underline">
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
