"use client";

import { useEffect, useState } from "react";

type FileRow = {
  id: string;
  fileUrl: string;
  originalFilename: string | null;
  sha256Hash: string | null;
  fileSize: number | null;
  createdAt: string;
};

export default function EvidenceDetailClient({ evidenceId }: { evidenceId: string }) {
  const [item, setItem] = useState<{
    id: string;
    title: string;
    evidenceType: string;
    sourceSystem: string | null;
    collectedAt: string;
    validityPeriodDays: number | null;
    validityEnd: string | null;
    isStale: boolean;
    implementationStatement: string | null;
    files: FileRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    fetch(`/api/governance/evidence/${evidenceId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then(setItem)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [evidenceId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    fetch(`/api/governance/evidence/${evidenceId}/files`, {
      method: "POST",
      body: form,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => { load(); e.target.value = ""; })
      .finally(() => setUploading(false));
  };

  if (loading) return <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>;
  if (!item) return <p className="text-sm text-[var(--color-status-red)]">Not found.</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-[var(--color-navy-primary)]">{item.title}</h3>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">Type: {item.evidenceType}</p>
        {item.sourceSystem && <p className="text-sm text-[var(--color-gray-600)]">Source: {item.sourceSystem}</p>}
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">Collected: {new Date(item.collectedAt).toLocaleString()}</p>
        {item.validityEnd && (
          <p className={`text-sm ${item.isStale ? "text-[var(--color-status-red)] font-medium" : "text-[var(--color-gray-600)]"}`}>
            Validity end: {new Date(item.validityEnd).toLocaleDateString()} {item.isStale && "(Stale)"}
          </p>
        )}
        {item.implementationStatement && (
          <p className="mt-2 text-sm text-[var(--color-gray-700)]">{item.implementationStatement}</p>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Files</h3>
        <div className="mt-3">
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Upload file</label>
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="mt-1 block w-full max-w-xs text-sm file:mr-2 file:rounded file:border-0 file:bg-[var(--color-gray-100)] file:px-3 file:py-1.5"
          />
          {uploading && <p className="mt-1 text-sm text-[var(--color-gray-500)]">Uploading…</p>}
        </div>
        <ul className="mt-4 space-y-2">
          {item.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-blue-accent)] hover:underline">
                {f.originalFilename ?? "File"}
              </a>
              {f.sha256Hash && <span className="font-mono text-xs text-[var(--color-gray-500)]">{f.sha256Hash.slice(0, 16)}…</span>}
            </li>
          ))}
        </ul>
        {item.files.length === 0 && <p className="mt-2 text-sm text-[var(--color-gray-500)]">No files yet.</p>}
      </div>
    </div>
  );
}
