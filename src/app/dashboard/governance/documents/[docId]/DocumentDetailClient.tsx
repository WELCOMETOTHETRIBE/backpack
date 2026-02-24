"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Doc = {
  id: string;
  docId: string;
  title: string;
  type: string;
  domain: string | null;
  version: string | null;
  status: string;
  nextReviewDate: string | null;
  approvalDate: string | null;
  reviewCadenceDays: number | null;
};
type Version = {
  id: string;
  versionNumber: number;
  fileUrl: string;
  sha256Hash: string | null;
  fileSize: number | null;
  originalFilename: string | null;
  createdAt: string;
  creatorEmail: string | null;
};

export default function DocumentDetailClient({ docId }: { docId: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/governance/documents/${docId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((d) => {
        setDoc(d.document);
        setVersions(d.versions ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [docId]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    fetch(`/api/governance/documents/${docId}/versions`, {
      method: "POST",
      body: form,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Upload failed"))))
      .then(() => { load(); e.target.value = ""; })
      .catch((err) => setError(err.message))
      .finally(() => setUploading(false));
  };

  const doAction = (action: "submit" | "approve" | "reject") => {
    setActioning(action);
    fetch(`/api/governance/documents/${docId}/${action}`, { method: "POST" })
      .then((r) => (r.ok ? Promise.resolve() : r.json().then((e) => Promise.reject(new Error(e?.error ?? "Failed")))))
      .then(load)
      .catch((e) => setError(e.message))
      .finally(() => setActioning(null));
  };

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-status-red)] bg-[var(--color-surface)] p-4 text-[var(--color-status-red)]">
        {error}
      </div>
    );
  }
  if (loading || !doc) {
    return <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = doc.nextReviewDate && doc.nextReviewDate < today;

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-gray-600)]">Document</h3>
        <p className="mt-1 font-mono font-semibold text-[var(--color-navy-primary)]">{doc.docId}</p>
        <p className="mt-1 text-lg text-[var(--color-gray-900)]">{doc.title}</p>
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          Type: {doc.type} {doc.domain ? ` · Domain: ${doc.domain}` : ""}
        </p>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Version: {doc.version ?? "—"} · Status:{" "}
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-gray-100)]">{doc.status}</span>
        </p>
        {doc.nextReviewDate && (
          <p className={`mt-1 text-sm ${isOverdue ? "text-[var(--color-status-amber)] font-medium" : "text-[var(--color-gray-600)]"}`}>
            Next review: {doc.nextReviewDate} {isOverdue && "(Overdue)"}
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Workflow</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {doc.status === "DRAFT" && (
            <button
              type="button"
              onClick={() => doAction("submit")}
              disabled={!!actioning}
              className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {actioning === "submit" ? "Submitting…" : "Submit for approval"}
            </button>
          )}
          {doc.status === "SUBMITTED" && (
            <>
              <button
                type="button"
                onClick={() => doAction("approve")}
                disabled={!!actioning}
                className="rounded-[var(--radius-md)] bg-[var(--color-status-green)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actioning === "approve" ? "Approving…" : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => doAction("reject")}
                disabled={!!actioning}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-50"
              >
                {actioning === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Version history</h3>
        <div className="mt-3">
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Upload new version</label>
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleUpload}
            disabled={uploading}
            className="mt-1 block w-full max-w-xs text-sm text-[var(--color-gray-600)] file:mr-2 file:rounded file:border-0 file:bg-[var(--color-gray-100)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {uploading && <p className="mt-1 text-sm text-[var(--color-gray-500)]">Uploading…</p>}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Version</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">File</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">SHA-256</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Date</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">By</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-[var(--color-border-muted)]">
                  <td className="py-2 font-mono">{v.versionNumber}</td>
                  <td className="py-2">
                    {v.fileUrl ? (
                      <a href={v.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-blue-accent)] hover:underline">
                        {v.originalFilename ?? "File"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs text-[var(--color-gray-600)]">{v.sha256Hash ? `${v.sha256Hash.slice(0, 16)}…` : "—"}</td>
                  <td className="py-2 text-[var(--color-gray-600)]">{new Date(v.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-[var(--color-gray-600)]">{v.creatorEmail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {versions.length === 0 && <p className="mt-2 text-sm text-[var(--color-gray-500)]">No versions yet. Upload a file above.</p>}
      </div>
    </div>
  );
}
