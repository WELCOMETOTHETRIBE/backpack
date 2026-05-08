"use client";

import { useState, useCallback } from "react";
import { ALL_CONTROL_IDS, getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import {
  GOVERNANCE_DOCUMENT_MATRIX,
  getArtifactLabelFromCodexFilename,
} from "@/lib/governance/governance-document-matrix";
import { X, FileUp, Package, HelpCircle } from "lucide-react";

const FILENAME_TOOLTIP =
  "For rapid mapping, name files using the MACTech basename from the matrix (e.g. MAC-POL-210_Access_Control_Policy.md). " +
  "Filenames matching a matrix row are auto-mapped. You can also map manually using the dropdown.";

function docTypeFromLabel(label: string): "POLICY" | "SOP" | "PLAN" | "STANDARD" | "PROCEDURE" {
  const lower = label.toLowerCase();
  if (lower.includes("policy")) return "POLICY";
  if (lower.includes("procedure") || lower.includes("sop")) return "PROCEDURE";
  if (lower.includes("plan")) return "PLAN";
  if (lower.includes("standard") || lower.includes("guide")) return "STANDARD";
  return "PROCEDURE";
}

function basenameFromPath(path: string): string {
  return path.split("/").pop() ?? path;
}

type UploadRow = {
  file: File;
  mapToLabel: string;
  inferred: boolean;
};

export function DocumentControlUploadModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const newRows: UploadRow[] = files.map((file) => {
      const basename = file.name.replace(/^.*[/\\]/, "");
      const inferredLabel = getArtifactLabelFromCodexFilename(basename);
      const mapToLabel =
        inferredLabel ??
        (GOVERNANCE_DOCUMENT_MATRIX.length > 0 ? GOVERNANCE_DOCUMENT_MATRIX[0]!.document : "");
      return {
        file,
        mapToLabel,
        inferred: Boolean(inferredLabel),
      };
    });
    setRows((prev) => [...prev, ...newRows]);
    setError(null);
  }, []);

  const setMapTo = useCallback((index: number, mapToLabel: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, mapToLabel } : r))
    );
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    const valid = rows.filter((r) => r.mapToLabel.trim());
    if (valid.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const recordsRes = await fetch("/api/control-records");
      if (!recordsRes.ok) throw new Error("Failed to load control records");
      const records: { id: string; controlId: string }[] = await recordsRes.json();
      const recordByControlId = Object.fromEntries(records.map((r) => [r.controlId, r]));

      for (const row of valid) {
        const label = row.mapToLabel.trim();
        const docType = docTypeFromLabel(label);
        const docIdFromFile = row.file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

        const createRes = await fetch("/api/governance/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId: docIdFromFile || label.slice(0, 50).replace(/\s+/g, "-"),
            title: label,
            type: docType,
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to create document");
        }
        const doc = (await createRes.json()) as { id: string };

        const formData = new FormData();
        formData.set("file", row.file);
        const versionRes = await fetch(`/api/governance/documents/${doc.id}/versions`, {
          method: "POST",
          body: formData,
        });
        if (!versionRes.ok) {
          const err = await versionRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to upload file");
        }

        const controlIdsNeedingLabel = ALL_CONTROL_IDS.filter((cid) =>
          getRequiredUploadArtifactLabels(cid).includes(label)
        );
        for (const controlId of controlIdsNeedingLabel) {
          const recordId = recordByControlId[controlId]?.id;
          if (!recordId) continue;
          await fetch("/api/control-records/artifacts", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              control_id: controlId,
              artifact_label: label,
              artifact_type: "REFERENCE",
              value_text: JSON.stringify({ governanceDocumentId: doc.id }),
            }),
          });
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [rows, onSaved]);

  const matrixOptions = GOVERNANCE_DOCUMENT_MATRIX.map((r) => ({
    label: r.document,
    basename: r.mactechDocument ? basenameFromPath(r.mactechDocument) : "",
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-control-upload-title"
    >
      <div className="flex h-[min(90vh,36rem)] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="doc-control-upload-title" className="text-lg font-semibold text-slate-800">
            Upload documents & map to matrix
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
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-sm text-slate-700">
            <HelpCircle className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" aria-hidden />
            <p title={FILENAME_TOOLTIP}>
              {FILENAME_TOOLTIP}
            </p>
          </div>
          <p className="mb-2 text-sm text-slate-600">
            Expected filename format for auto-mapping (from Governance Document Matrix):
          </p>
          <p className="mb-4 font-mono text-xs text-slate-500 break-all">
            e.g. MAC-POL-210_Access_Control_Policy.md, MAC-SOP-254_Flaw_Remediation_Procedure.md
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Package className="h-4 w-4" />
              Choose files (one or many)
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.md,.txt"
                onChange={handleFilesSelected}
                className="sr-only"
              />
            </label>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
              No files added. Use &quot;Choose files&quot; to add one or more documents, then map each to a required matrix row.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 font-semibold text-slate-700">Filename</th>
                    <th className="px-3 py-2 font-semibold text-slate-700">Map to (required document)</th>
                    <th className="w-10 px-2 py-2" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-[200px] truncate px-3 py-2 font-mono text-slate-700" title={row.file.name}>
                        {row.file.name}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.mapToLabel}
                          onChange={(e) => setMapTo(i, e.target.value)}
                          className="w-full max-w-md rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                        >
                          {matrixOptions.map((opt) => (
                            <option key={opt.label} value={opt.label} title={opt.basename}>
                              {opt.label}
                              {opt.basename ? ` (${opt.basename})` : ""}
                            </option>
                          ))}
                        </select>
                        {row.inferred && (
                          <span className="ml-2 text-xs text-emerald-600">auto-mapped</span>
                        )}
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
            onClick={handleUpload}
            disabled={uploading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? "Uploading…" : `Upload ${rows.length} document${rows.length !== 1 ? "s" : ""} & map`}
          </button>
        </div>
      </div>
    </div>
  );
}
