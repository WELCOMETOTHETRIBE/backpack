"use client";

import { useState, useEffect } from "react";

type FileItem = {
  id: string;
  fileUrl: string;
  originalFilename: string | null;
  fileSize: number | null;
  createdAt: string;
};

type Props = { entryId: string };

export function EntryAttachments({ entryId }: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/evidence-engine/entries/${encodeURIComponent(entryId)}/files`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to load attachments");
        setFiles([]);
        return;
      }
      setFiles(data.files ?? []);
    } catch {
      setError("Request failed");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [entryId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/evidence-engine/entries/${encodeURIComponent(entryId)}/files`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
        return;
      }
      await fetchFiles();
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Attachments</h3>
        <label className="cursor-pointer rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
          <input
            type="file"
            className="sr-only"
            onChange={handleUpload}
            disabled={uploading}
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.xlsx,.xls"
          />
          {uploading ? "Uploading…" : "Add file"}
        </label>
      </div>
      {uploadError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {uploadError}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">Loading…</p>
      ) : files.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">No attachments. Add a file (PDF, images, CSV, TXT, or XLSX, max 10MB).</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-muted)] px-3 py-2 text-sm">
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-medium text-[var(--color-primary)] hover:underline"
              >
                {f.originalFilename ?? "Attachment"}
              </a>
              <span className="shrink-0 text-[var(--color-gray-600)]">{formatSize(f.fileSize)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
