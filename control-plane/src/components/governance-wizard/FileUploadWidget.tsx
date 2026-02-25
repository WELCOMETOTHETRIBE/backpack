"use client";

import { useState, useRef } from "react";

export function FileUploadWidget({
  controlRecordId,
  artifactLabel,
  onUploaded,
  technicalEvidencePayload,
}: {
  controlRecordId: string;
  artifactLabel: string;
  onUploaded?: () => void;
  /** When set, uploads to /api/technical-evidence with requirementId and evidenceType instead of artifacts. */
  technicalEvidencePayload?: { requirementId: string; evidenceType: string };
}) {
  const [version, setVersion] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTechnical = Boolean(technicalEvidencePayload);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Select a file");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      if (isTechnical && technicalEvidencePayload) {
        const form = new FormData();
        form.set("file", file);
        form.set("controlRecordId", controlRecordId);
        form.set("requirementId", technicalEvidencePayload.requirementId);
        form.set("evidenceType", technicalEvidencePayload.evidenceType);
        const res = await fetch("/api/technical-evidence", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("controlRecordId", controlRecordId);
        form.set("artifactLabel", artifactLabel);
        if (version) form.set("version", version);
        if (approvalDate) form.set("approvalDate", approvalDate);
        const res = await fetch("/api/artifacts", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
      }
      if (inputRef.current) inputRef.current.value = "";
      setVersion("");
      setApprovalDate("");
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3">
      <div className="min-w-[180px] flex-1">
        <label className="block text-xs font-medium text-gray-600">File</label>
        <input
          ref={inputRef}
          type="file"
          className="mt-1 block w-full text-sm text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-[#0F172A] file:px-3 file:py-1 file:text-white"
          disabled={uploading}
        />
      </div>
      {!isTechnical && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600">Version</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0"
              className="mt-1 w-24 rounded border border-gray-300 px-2 py-1 text-sm"
              disabled={uploading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Approval date</label>
            <input
              type="date"
              value={approvalDate}
              onChange={(e) => setApprovalDate(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
              disabled={uploading}
            />
          </div>
        </>
      )}
      <button
        type="submit"
        disabled={uploading}
        className="rounded bg-[#0F172A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1e293b] disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
