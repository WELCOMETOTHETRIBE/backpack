"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Doc = {
  id: string;
  docId: string;
  title: string;
  type: string;
  domain: string | null;
  version: string | null;
  status: string;
  nextReviewDate: string | null;
  updatedAt: string;
};

export default function GovernanceDocumentsClient() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const [data, setData] = useState<{ items: Doc[]; total: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("limit", "20");
    fetch(`/api/governance/documents?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData({ items: [], total: 0, limit: 20 }))
      .finally(() => setLoading(false));
  }, [type, status, page]);

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const basePath = "/dashboard/governance/documents";

  const buildUrl = (updates: Record<string, string>) => {
    const p = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `${basePath}?${p.toString()}`;
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-[var(--color-gray-700)]">Type</label>
        <select
          value={type}
          onChange={(e) => window.location.href = buildUrl({ type: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="POLICY">Policy</option>
          <option value="SOP">SOP</option>
          <option value="PLAN">Plan</option>
          <option value="STANDARD">Standard</option>
          <option value="CHARTER">Charter</option>
          <option value="PROCEDURE">Procedure</option>
          <option value="TEMPLATE">Template</option>
        </select>
        <label className="ml-4 text-sm font-medium text-[var(--color-gray-700)]">Status</label>
        <select
          value={status}
          onChange={(e) => window.location.href = buildUrl({ status: e.target.value, page: "1" })}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="RETIRED">Retired</option>
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
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Doc ID</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Title</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Type</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Version</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Next review</th>
                  <th className="px-4 py-3 font-semibold text-[var(--color-gray-700)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((doc) => (
                  <tr key={doc.id} className="border-b border-[var(--color-border-muted)] hover:bg-[var(--color-gray-50)]">
                    <td className="px-4 py-3 font-mono text-[var(--color-gray-700)]">{doc.docId}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-900)]">{doc.title}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{doc.type}</td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">{doc.version ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gray-100)] text-[var(--color-gray-700)]">
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-gray-600)]">
                      {doc.nextReviewDate
                        ? (doc.nextReviewDate < today ? (
                            <span className="text-[var(--color-status-amber)]">Overdue: {doc.nextReviewDate}</span>
                          ) : (
                            doc.nextReviewDate
                          ))
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/governance/documents/${doc.id}`}
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
          {total === 0 && <p className="text-sm text-[var(--color-gray-500)]">No documents. Create one to get started.</p>}
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
