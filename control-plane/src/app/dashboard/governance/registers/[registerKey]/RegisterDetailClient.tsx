"use client";

import { useEffect, useState } from "react";

type Col = { key: string; label: string; type?: string };
type Register = {
  id: string;
  registerKey: string;
  name: string;
  description: string | null;
  requiredColumns: Col[] | null;
};
type Entry = {
  id: string;
  entryData: Record<string, unknown>;
  hold: number | null;
  createdAt: string;
};

export default function RegisterDetailClient({ registerKey }: { registerKey: string }) {
  const [register, setRegister] = useState<Register | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!registerKey) return;
    setLoading(true);
    fetch(`/api/governance/registers/${encodeURIComponent(registerKey)}?page=${page}&limit=20`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setRegister(d.register ?? null);
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setRegister(null))
      .finally(() => setLoading(false));
  }, [registerKey, page]);

  const columns = (register?.requiredColumns ?? []) as Col[];
  const keys = columns.map((c) => c.key);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const entryData: Record<string, unknown> = {};
    keys.forEach((k) => {
      const v = formData[k];
      if (v !== undefined) entryData[k] = v;
    });
    fetch(`/api/governance/registers/${encodeURIComponent(registerKey)}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryData }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setFormData({});
        setPage(1);
        fetch(`/api/governance/registers/${encodeURIComponent(registerKey)}?page=1&limit=20`)
          .then((r) => r.json())
          .then((d) => {
            setEntries(d.entries ?? []);
            setTotal(d.total ?? 0);
          });
      })
      .finally(() => setSubmitting(false));
  };

  if (loading && !register) {
    return <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>;
  }
  if (!register) {
    return <p className="text-sm text-[var(--color-status-red)]">Register not found.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">{register.name}</h3>
        <p className="mt-1 font-mono text-sm text-[var(--color-gray-600)]">{register.registerKey}</p>
        {register.description && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">{register.description}</p>
        )}
        <a
          href={`/api/governance/registers/${encodeURIComponent(registerKey)}/export`}
          className="mt-3 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
        >
          Export CSV
        </a>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Create entry</h3>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {columns.map((col) => (
            <div key={col.key}>
              <label className="block text-sm font-medium text-[var(--color-gray-700)]">{col.label || col.key}</label>
              <input
                type="text"
                value={formData[col.key] ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, [col.key]: e.target.value }))}
                className="mt-1 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add entry"}
          </button>
        </form>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Entries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Created</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Hold</th>
                {keys.map((k) => (
                  <th key={k} className="py-2 font-semibold text-[var(--color-gray-700)]">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-border-muted)]">
                  <td className="py-2 text-[var(--color-gray-600)]">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="py-2">{e.hold ? "Yes" : "No"}</td>
                  {keys.map((k) => (
                    <td key={k} className="py-2 text-[var(--color-gray-700)]">
                      {String((e.entryData ?? {})[k] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && <p className="mt-2 text-sm text-[var(--color-gray-500)]">No entries yet.</p>}
        {totalPages > 1 && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-sm text-[var(--color-blue-accent)] hover:underline disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--color-gray-600)]">Page {page} of {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="text-sm text-[var(--color-blue-accent)] hover:underline disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
