"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ArtifactDetailActions({
  artifactId,
  hasFile,
  secondary,
}: {
  artifactId: string;
  hasFile: boolean;
  /** True when a register quick-add is also shown above; renders this panel
   *  as the secondary ("Or upload a document instead") option. */
  secondary?: boolean;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/artifacts/${artifactId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Upload failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile() {
    window.location.href = `/api/artifacts/${artifactId}`;
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {secondary ? "Or upload a document instead" : "Actions"}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
          {uploading ? "Uploading…" : hasFile ? "Replace file" : "Upload file"}
          <input
            type="file"
            className="hidden"
            onChange={onFileChange}
            disabled={uploading}
          />
        </label>
        {hasFile && (
          <button
            onClick={downloadFile}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            Download
          </button>
        )}
      </div>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </section>
  );
}
