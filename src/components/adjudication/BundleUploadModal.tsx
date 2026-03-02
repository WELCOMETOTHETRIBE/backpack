"use client";

import { useState, useEffect, useCallback } from "react";
import { X, FileUp, Package } from "lucide-react";
import { parseGovernanceFilename } from "@/lib/governance/document-naming";

type BundleRow = {
  file: File;
  artifactLabel: string;
  controlIds: string[];
  status: "ready" | "unmapped";
};

export function BundleUploadModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (controlIdsMapped: string[]) => void;
}) {
  const [records, setRecords] = useState<{ id: string; controlId: string }[]>([]);
  const [rows, setRows] = useState<BundleRow[]>([]);
  const [version, setVersion] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    const res = await fetch("/api/control-records");
    if (res.ok) setRecords(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRecords().finally(() => setLoading(false));
  }, [fetchRecords]);

  const recordByControlId = Object.fromEntries(records.map((r) => [r.controlId, r]));

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const newRows: BundleRow[] = files.map((file) => {
      const parsed = parseGovernanceFilename(file.name);
      const hasMapping = parsed.controlIds.length > 0 && parsed.artifactLabel;
      return {
        file,
        artifactLabel: parsed.artifactLabel ?? "",
        controlIds: parsed.controlIds ?? [],
        status: hasMapping ? "ready" : "unmapped",
      };
    });
    setRows((prev) => [...prev, ...newRows]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const readyRows = rows.filter((r) => r.status === "ready" && r.controlIds.length > 0 && r.artifactLabel.trim());

  async function handleUploadAll() {
    if (readyRows.length === 0) return;
    setUploading(true);
    const allControlIdsMapped = new Set<string>();
    try {
      for (const row of readyRows) {
        const controlRecordIds = row.controlIds.map((cid) => recordByControlId[cid]?.id).filter(Boolean) as string[];
        if (controlRecordIds.length === 0) continue;
        const formData = new FormData();
        formData.set("file", row.file);
        formData.set("artifactLabel", row.artifactLabel.trim());
        if (version) formData.set("version", version);
        if (approvalDate) formData.set("approvalDate", approvalDate);
        formData.set("controlRecordIds", JSON.stringify(controlRecordIds));
        const res = await fetch("/api/artifacts", { method: "POST", body: formData });
        if (res.ok) row.controlIds.forEach((id) => allControlIdsMapped.add(id));
      }
      onSaved([...allControlIdsMapped]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-upload-title"
    >
      <div className="flex h-[min(90vh,36rem)] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="bundle-upload-title" className="text-lg font-semibold text-slate-800">
            Upload bundle
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-4 text-sm text-slate-600">
            Add multiple files. Names like <span className="font-mono">3-1.1-Access-Control-Policy-v1.pdf</span> or{" "}
            <span className="font-mono">MAC-SOP-239_System_Monitoring_Procedure.md</span> are auto-mapped to controls.
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Package className="h-4 w-4" />
              Choose files
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.md,.txt"
                onChange={handleFilesSelected}
                className="sr-only"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Version (optional):</span>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1"
                className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Approval date (optional):</span>
              <input
                type="date"
                value={approvalDate}
                onChange={(e) => setApprovalDate(e.target.value)}
                className="rounded border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading control records…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
              No files added. Use &quot;Choose files&quot; to add documents.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 font-semibold text-slate-700">Filename</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Document type</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Controls</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Status</th>
                    <th className="w-10 px-2 py-2" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-[180px] truncate px-3 py-2 font-mono text-slate-700" title={row.file.name}>
                        {row.file.name}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{row.artifactLabel || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.controlIds.length > 0 ? row.controlIds.slice(0, 5).join(", ") + (row.controlIds.length > 5 ? "…" : "") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.status === "ready" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.status === "ready" ? "Ready" : "Unmapped"}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={uploading || readyRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? "Uploading…" : `Upload ${readyRows.length} document${readyRows.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
